import { randomUUID } from 'node:crypto'
import { Request, type Host, type Snapshot } from '@supilot/contracts'
import type { DiagnosticPlugin } from '@supilot/plugin-sdk'
import { Store } from './storage'
import { OpenSSH } from './ssh'
import { Trust } from './trust'
import { Sessions } from './sessions'
import { Tasks } from './tasks'
export { Sessions } from './sessions'
export { OpenSSH } from './ssh'

export type EngineOptions = {
  /** Pass null in isolated tests so the user's real SSH inventory is never read. */
  sshConfigPath?: string | null
}

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
    private publish: (snapshot: Snapshot) => void,
    options: EngineOptions = {}
  ) {
    this.store = new Store(dataPath)
    this.ssh = new OpenSSH(dataPath, options.sshConfigPath)
    this.removeLegacyLocalProfile()
    this.importUserSshConfig()
    this.trust = new Trust(this.ssh)
    this.sessions = new Sessions(this.ssh, () => this.changed())
    this.tasks = new Tasks(this.store, this.ssh, () => this.changed())
  }
  private removeLegacyLocalProfile() {
    for (const host of this.store.hosts()) {
      if (
        host.local &&
        !host.source &&
        host.address === '127.0.0.1' &&
        host.port === 22 &&
        host.username &&
        host.auth === 'agent' &&
        host.group === '本机' &&
        host.tags.length === 1 &&
        host.tags[0] === 'localhost' &&
        host.notes.startsWith('由 SuPilot 自动识别的本机档案。')
      )
        this.store.deleteHost(host.id)
    }
  }
  private importUserSshConfig() {
    const discovered = this.ssh.discoverUserConfig()
    const existing = this.store.hosts()
    const aliases = new Set(discovered.map((config) => config.alias.toLowerCase()))
    for (const config of discovered) {
      const fingerprint = [
        config.hostname,
        config.port,
        config.username,
        config.identityFile,
        config.proxyCommand || ''
      ].join('\0')
      const previous = existing.find(
        (host) =>
          host.source === 'ssh-config' &&
          host.sshConfigAlias?.toLowerCase() === config.alias.toLowerCase()
      )
      if (previous && !previous.sshConfigFingerprint) continue
      if (previous && previous.sshConfigFingerprint === fingerprint) continue
      if (previous) {
        const refreshed = this.importedHost(config, previous.id, fingerprint)
        if (!refreshed) continue
        this.store.saveHost(refreshed)
        existing.splice(existing.indexOf(previous), 1, refreshed)
        continue
      }
      const host = this.importedHost(config, randomUUID(), fingerprint)
      if (!host) continue
      this.store.saveHost(host)
      existing.push(host)
    }
    for (const host of existing) {
      if (
        host.source === 'ssh-config' &&
        host.sshConfigFingerprint &&
        !aliases.has(host.sshConfigAlias?.toLowerCase() || '')
      )
        this.store.deleteHost(host.id)
    }
  }
  private importedHost(
    config: ReturnType<typeof this.ssh.discoverUserConfig>[number],
    id: string,
    fingerprint: string
  ): Host | undefined {
    const username = config.username
      .replace(/[^a-zA-Z0-9_.@-]/g, '-')
      .replace(/^[^a-zA-Z0-9_]/, 'user-')
      .slice(0, 64)
    const address = config.hostname.replace(/^\[|\]$/g, '')
    if (
      !username ||
      !address ||
      config.alias.length > 100 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9.:_%\-]*$|^::[a-fA-F0-9:]+$/.test(address)
    )
      return
    return {
      id,
      name: config.alias,
      address,
      port: config.port,
      sshdPort: config.port,
      username,
      auth: config.identityFile ? 'key' : 'agent',
      keyPath: config.identityFile,
      group: 'SSH 配置',
      tags: ['ssh-config'],
      notes: [
        `从 ${config.configPath} 自动读取。编辑并保存后，SuPilot 使用当前档案快照。`,
        config.proxyCommand
          ? '该 Host 含 ProxyCommand；首次指纹核验仍需当前版本支持的直连路径。'
          : ''
      ]
        .filter(Boolean)
        .join('\n'),
      source: 'ssh-config',
      sshConfigAlias: config.alias,
      sshConfigFingerprint: fingerprint,
      updatedAt: new Date().toISOString()
    }
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
        const previous = req.host.id
          ? this.store.hosts().find((h) => h.id === req.host.id)
          : undefined
        if (req.host.id && !previous) throw new Error('主机档案已被删除，请新建档案。')
        const {
          source: _source,
          sshConfigAlias: _sshConfigAlias,
          sshConfigFingerprint: _sshConfigFingerprint,
          ...draft
        } = req.host
        const host: Host = {
          ...draft,
          ...(previous?.source === 'ssh-config'
            ? { source: 'ssh-config' as const, sshConfigAlias: previous.sshConfigAlias }
            : {}),
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
        if (this.store.hosts().find((host) => host.id === req.id)?.source === 'ssh-config')
          throw new Error('该档案来自本机 SSH 配置，请从 ~/.ssh/config 移除对应 Host。')
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
