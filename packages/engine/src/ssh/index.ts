import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Host } from '@supilot/contracts'
import { discoverSshConfig, type SshConfigHost } from './config'

export type ExecResult = {
  code: number
  stdout: string
  stderr: string
  reason?: 'timeout' | 'limit' | 'cancel' | 'spawn'
}
export const OUTPUT_LIMIT = 128 * 1024
export function runProcess(
  file: string,
  args: string[],
  timeout = 20000,
  signal?: AbortSignal
): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = '',
      stderr = '',
      bytes = 0,
      reason: ExecResult['reason'],
      done = false
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C', SSH_ASKPASS_REQUIRE: 'never' }
    })
    const stop = (why: ExecResult['reason']) => {
      reason ??= why
      child.kill()
    }
    const timer = setTimeout(() => stop('timeout'), timeout)
    const cancel = () => stop('cancel')
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
    const finish = (code: number) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      resolve({ code, stdout, stderr, reason })
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    const collect = (part: string, error: boolean) => {
      bytes += Buffer.byteLength(part)
      if (bytes > OUTPUT_LIMIT) {
        stop('limit')
        return
      }
      if (error) stderr += part
      else stdout += part
    }
    child.stdout.on('data', (d) => collect(d, false))
    child.stderr.on('data', (d) => collect(d, true))
    child.on('error', (e) => {
      stderr = e.message
      reason = 'spawn'
      finish(-1)
    })
    child.on('close', (code) => finish(code ?? -1))
  })
}
export class OpenSSH {
  readonly executable: string
  readonly keyscan: string
  readonly directory: string
  readonly config: string
  readonly knownHosts: string
  readonly userConfig: string | null
  readonly available: boolean
  constructor(data: string, userConfigPath?: string | null) {
    const winDirectory = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH')
    this.executable = process.platform === 'win32' ? join(winDirectory, 'ssh.exe') : 'ssh'
    this.keyscan =
      process.platform === 'win32' ? join(winDirectory, 'ssh-keyscan.exe') : 'ssh-keyscan'
    this.directory = join(data, 'ssh')
    mkdirSync(this.directory, { recursive: true })
    this.config = join(this.directory, 'config')
    this.knownHosts = join(this.directory, 'known_hosts')
    this.userConfig =
      userConfigPath === null ? null : userConfigPath || join(homedir(), '.ssh', 'config')
    if (!existsSync(this.config))
      writeFileSync(
        this.config,
        '# Managed by SuPilot. System SSH configuration is not imported.\n',
        { mode: 0o600 }
      )
    if (!existsSync(this.knownHosts)) writeFileSync(this.knownHosts, '', { mode: 0o600 })
    this.available =
      spawnSync(this.executable, ['-V'], { windowsHide: true, timeout: 5000 }).status === 0
  }
  require() {
    if (!this.available)
      throw new Error(
        '找不到系统 OpenSSH。请在 Windows 设置 → 可选功能中安装 OpenSSH 客户端，然后重启 SuPilot。'
      )
  }
  discoverUserConfig(): SshConfigHost[] {
    return this.userConfig ? discoverSshConfig(this.userConfig) : []
  }
  destination(host: Host) {
    return host.source === 'ssh-config' && host.sshConfigAlias ? host.sshConfigAlias : host.address
  }
  args(host: Host, batch = false): string[] {
    this.require()
    if (host.auth === 'key' && !existsSync(host.keyPath))
      throw new Error('私钥文件不存在，请编辑主机并选择现有私钥；应用不会创建或替换登录私钥。')
    const fromUserConfig = host.source === 'ssh-config' && host.sshConfigAlias && this.userConfig
    const args = [
      '-F',
      fromUserConfig ? this.userConfig : this.config,
      '-o',
      `UserKnownHostsFile="${this.knownHosts.replace(/\\/g, '/')}"`,
      '-o',
      'GlobalKnownHostsFile=none',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'UpdateHostKeys=no',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'ConnectionAttempts=1',
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=2',
      '-o',
      'ForwardAgent=no',
      '-o',
      'ClearAllForwardings=yes',
      ...(fromUserConfig ? ['-o', `HostName=${host.address}`] : []),
      '-p',
      String(host.port),
      '-l',
      host.username
    ]
    if (host.auth === 'key') args.push('-i', host.keyPath, '-o', 'IdentitiesOnly=yes')
    if (batch)
      args.push(
        '-o',
        'BatchMode=yes',
        '-o',
        'NumberOfPasswordPrompts=0',
        '-o',
        'PreferredAuthentications=publickey',
        '-T'
      )
    return args
  }
  execute(host: Host, command: string, signal: AbortSignal) {
    return runProcess(
      this.executable,
      [...this.args(host, true), this.destination(host), command],
      20000,
      signal
    )
  }
}
