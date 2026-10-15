import * as pty from 'node-pty'
import { randomUUID } from 'node:crypto'
import { TerminalMessage, activeSession, type Host, type Session } from '@supilot/contracts'
import type { OpenSSH } from '../ssh'

export interface DataPort {
  postMessage(message: unknown): void
  on(event: 'message', listener: (event: { data: unknown }) => void): unknown
  on(event: 'close', listener: () => void): unknown
  start(): void
  close(): void
}
// A random nonce travels in the SSH exec request, sent only AFTER authentication.
// A pre-auth banner cannot know it. Consume the marker before displaying output;
// the bootstrap then execs the user's login shell. No later automation uses this PTY.
export class StartupMarker {
  private pending = ''
  confirmed = false
  constructor(readonly marker: string) {}
  consume(chunk: string): string {
    if (this.confirmed) return chunk
    const text = this.pending + chunk
    const index = text.indexOf(this.marker)
    if (index >= 0) {
      this.confirmed = true
      this.pending = ''
      return text.slice(0, index) + text.slice(index + this.marker.length)
    }
    let keep = Math.min(text.length, this.marker.length - 1)
    while (keep > 0 && !this.marker.startsWith(text.slice(-keep))) keep--
    this.pending = keep ? text.slice(-keep) : ''
    return keep ? text.slice(0, -keep) : text
  }
}
type Live = {
  dto: Session
  pty: pty.IPty
  port?: DataPort
  buffer: string
  inflight: number
  timer: ReturnType<typeof setInterval>
  paused: boolean
  attached: boolean
  exited: boolean
  tail: string
}
const HIGH_WATER = 128 * 1024
const MAX_BUFFER = 1024 * 1024
export class Sessions {
  private live = new Map<string, Live>()
  constructor(
    private ssh: OpenSSH,
    private changed: () => void
  ) {}
  list() {
    return [...this.live.values()].map((s) => s.dto)
  }
  open(target: Host): Session {
    if (this.list().filter(activeSession).length >= 16)
      throw new Error('最多同时打开 16 个会话，请先关闭不再使用的终端。')
    const id = randomUUID()
    const marker = new StartupMarker(`\x1b]777;supilot-session:${id}\x07`)
    const command = `sh -c 'printf "\\033]777;supilot-session:${id}\\007"; exec "${'${SHELL:-/bin/sh}'}" -l'`
    const proc = pty.spawn(
      this.ssh.executable,
      [...this.ssh.args(target), '-tt', target.address, command],
      {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd: this.ssh.directory,
        env: { ...process.env, TERM: 'xterm-256color', LC_ALL: 'C', SSH_ASKPASS_REQUIRE: 'never' },
        useConpty: true
      }
    )
    const dto: Session = {
      id,
      target: structuredClone(target),
      state: 'awaiting-auth',
      createdAt: new Date().toISOString(),
      message: 'OpenSSH 已启动，等待登录握手。可在终端中输入密码或私钥口令；目标需要提供 sh。'
    }
    const live: Live = {
      dto,
      pty: proc,
      buffer: '',
      tail: '',
      inflight: 0,
      paused: false,
      attached: false,
      exited: false,
      timer: setInterval(() => this.flush(id), 16)
    }
    this.live.set(id, live)
    proc.onData((data) => {
      const output = marker.consume(data)
      live.tail = (live.tail + output).slice(-16384)
      live.buffer += output
      if (marker.confirmed && dto.state === 'awaiting-auth') {
        dto.state = 'authenticated'
        dto.message = '已收到认证后发送的会话握手，正在使用登录 Shell。'
        this.changed()
      }
      if (live.buffer.length > MAX_BUFFER) {
        dto.state = 'interrupted'
        dto.message = '终端输出超出 1M 字符缓冲上限，已关闭本地会话。远端进程状态未知。'
        this.dispose(live)
        this.changed()
        return
      }
      if (live.buffer.length + live.inflight > HIGH_WATER && !live.paused) {
        proc.pause()
        live.paused = true
      }
    })
    proc.onExit(({ exitCode }) => {
      live.exited = true
      if (activeSession(dto)) {
        const authenticated = dto.state === 'authenticated'
        dto.state = authenticated ? (exitCode === 0 ? 'closed' : 'interrupted') : 'failed'
        dto.message = authenticated
          ? exitCode === 0
            ? 'SSH 会话已结束。'
            : '连接中断；远端程序状态未知。'
          : /Permission denied|Authentication failed/i.test(live.tail)
            ? '认证失败。请检查用户名、Agent 中的密钥或私钥引用。'
            : /HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i.test(live.tail)
              ? '主机指纹校验失败，OpenSSH 已阻止连接。请核实服务器身份。'
              : /Connection refused/i.test(live.tail)
                ? '连接被拒绝。请检查公网端口与 SSH 服务。'
                : /timed out/i.test(live.tail)
                  ? '连接超时，请检查网络与公网端口。'
                  : '会话在登录握手前结束。请查看终端输出；目标需提供 sh 与可运行的登录 Shell。'
        dto.message += `（退出码 ${exitCode}）`
      }
      this.flush(id)
      this.changed()
    })
    this.changed()
    return dto
  }
  attach(id: string, port: DataPort) {
    const live = this.live.get(id)
    if (!live || live.attached) {
      port.close()
      throw new Error('会话不存在或数据通道已经绑定。')
    }
    live.attached = true
    live.port = port
    port.on('message', (e) => {
      const result = TerminalMessage.safeParse(e.data)
      if (!result.success) return
      const m = result.data
      try {
        if (m.type === 'input' && activeSession(live.dto)) live.pty.write(m.data)
        if (m.type === 'resize' && activeSession(live.dto)) live.pty.resize(m.cols, m.rows)
        if (m.type === 'ack') {
          live.inflight = Math.max(0, live.inflight - Math.min(m.count, live.inflight))
          if (live.paused && live.inflight + live.buffer.length < HIGH_WATER / 2) {
            live.pty.resume()
            live.paused = false
          }
          this.flush(id)
        }
      } catch {
        /* Process may have exited between validation and delivery. */
      }
    })
    port.on('close', () => {
      live.port = undefined
      if (activeSession(live.dto)) {
        live.dto.state = 'interrupted'
        live.dto.message = '界面数据通道已关闭；远端结果未知。'
        this.dispose(live)
        this.changed()
      }
    })
    port.start()
    this.flush(id)
  }
  private flush(id: string) {
    const live = this.live.get(id)
    if (live && !activeSession(live.dto) && !live.buffer) clearInterval(live.timer)
    if (!live?.port || !live.buffer || live.inflight >= HIGH_WATER) return
    const data = live.buffer.slice(0, 16384)
    live.buffer = live.buffer.slice(data.length)
    live.inflight += data.length
    live.port.postMessage({ type: 'output', data })
  }
  close(id: string) {
    const live = this.live.get(id)
    if (!live) return
    live.dto.state = 'closed'
    live.dto.message = '已关闭本地 SSH 会话；远端程序是否退出取决于远端程序。'
    this.dispose(live)
    live.port?.close()
    this.live.delete(id)
    this.changed()
  }
  private dispose(live: Live) {
    clearInterval(live.timer)
    if (!live.exited) {
      try {
        live.pty.kill()
      } catch {
        /* Already exited. */
      }
    }
  }
  shutdown() {
    for (const id of this.live.keys()) this.close(id)
  }
}
