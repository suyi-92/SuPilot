import { randomUUID } from 'node:crypto'
import { hostname, userInfo } from 'node:os'
import { Request, type Host, type Snapshot } from '@supilot/contracts'
import type { DiagnosticPlugin } from '@supilot/plugin-sdk'
import { Store } from './storage'
import { OpenSSH } from './ssh'
import { Trust } from './trust'
import { Sessions } from './sessions'
import { Tasks } from './tasks'
export { Sessions } from './sessions'
export { OpenSSH } from './ssh'

export class Engine {
  readonly store: Store
  readonly ssh: OpenSSH
  readonly trust: Trust
  readonly sessions: Sessions
  readonly tasks: Tasks
  private plugins = new Map<string, DiagnosticPlugin>()
  private closing = false
  constructor(
    readonly dataPath: string,
    private publish: (snapshot: Snapshot) => void
  ) {
    this.store = new Store(dataPath)
    this.ensureLocalHost()
    this.ssh = new OpenSSH(dataPath)
    this.trust = new Trust(this.ssh)
    this.sessions = new Sessions(this.ssh, () => this.changed())
    this.tasks = new Tasks(this.store, this.ssh, () => this.changed())
  }
  private ensureLocalHost() {
    if (this.store.hosts().some((host) => host.local)) return
    const username =
      (userInfo().username || process.env.USERNAME || 'user')
        .replace(/[^a-zA-Z0-9_.@-]/g, '-')
        .replace(/^[^a-zA-Z0-9_]/, 'user-')
        .slice(0, 64) || 'user'
    const machine = hostname().trim() || 'localhost'
    this.store.saveHost({
      id: randomUUID(),
      local: true,
      name: `本机 · ${machine}`,
      address: '127.0.0.1',
      port: 22,
      sshdPort: 22,
      username,
      auth: 'agent',
      keyPath: '',
      group: '本机',
      tags: ['localhost'],
      notes:
        '由 SuPilot 自动识别的本机档案。不会自动连接；需要 Windows OpenSSH Server 才能通过 SSH 打开。',
      updatedAt: new Date().toISOString()
    })
  }
  register(plugin: DiagnosticPlugin) {
    if (plugin.sdkVersion !== 1 || !plugin.readOnly || this.plugins.has(plugin.id))
      throw new Error('不兼容或重复的内置插件')
    this.plugins.set(plugin.id, plugin)
  }
  snapshot(): Snapshot {
    return {
      hosts: this.store.hosts(),
      tasks: this.store.tasks(),
      sessions: this.sessions.list(),
      plugins: [...this.plugins.values()].map(({ checks, sdkVersion, ...info }) => info),
      sshAvailable: this.ssh.available,
      dataPath: this.dataPath
    }
  }
  private changed() {
    if (!this.closing) this.publish(this.snapshot())
  }
  async handle(raw: unknown): Promise<unknown> {
    const req = Request.parse(raw)
    switch (req.type) {
      case 'snapshot':
        return this.snapshot()
      case 'host.save': {
        if (req.host.id && !this.store.hosts().some((h) => h.id === req.host.id))
          throw new Error('主机档案已被删除，请新建档案。')
        const host: Host = {
          ...req.host,
          keyPath: req.host.auth === 'agent' ? '' : req.host.keyPath,
          id: req.host.id ?? randomUUID(),
          updatedAt: new Date().toISOString()
        }
        this.store.saveHost(host)
        this.changed()
        return host
      }
      case 'host.delete':
        if (this.store.hosts().find((host) => host.id === req.id)?.local)
          throw new Error('本机档案由应用自动维护，不能删除。')
        this.store.deleteHost(req.id)
        this.changed()
        return null
      case 'trust.inspect': {
        const host = this.store.hosts().find((h) => h.id === req.hostId)
        if (!host) throw new Error('主机不存在。')
        if (req.target?.id && req.target.id !== host.id) throw new Error('目标 ID 不匹配。')
        return this.trust.inspect(
          req.target ? { ...req.target, id: host.id, updatedAt: host.updatedAt } : host
        )
      }
      case 'trust.accept':
        return this.trust.accept(req.token)
      case 'session.open':
        return this.sessions.open(this.trust.consume(req.token))
      case 'session.close':
        this.sessions.close(req.id)
        return null
      case 'task.run': {
        const plugin = this.plugins.get(req.pluginId)
        if (!plugin) throw new Error('该操作尚未实现或插件未注册。')
        return this.tasks.start(this.trust.consume(req.token), plugin)
      }
      case 'task.cancel':
        this.tasks.cancel(req.id)
        return null
    }
  }
  async shutdown() {
    this.closing = true
    this.sessions.shutdown()
    await this.tasks.shutdown()
    this.store.close()
  }
}
