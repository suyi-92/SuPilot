import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, appendFileSync } from 'node:fs'
import type { Host, TrustChallenge } from '@supilot/contracts'
import { OpenSSH, runProcess } from '../ssh'

type Key = { algorithm: string; data: string }
type Pending = { target: Host; keys: Key[]; expires: number; trusted: boolean }
export const hostAlias = (h: Host) => (h.port === 22 ? h.address : `[${h.address}]:${h.port}`)
export function parseKeys(text: string): Key[] {
  const keys = new Map<string, Key>()
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (
      parts.length === 3 &&
      /^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa)$/.test(parts[1]) &&
      /^[A-Za-z0-9+/=]+$/.test(parts[2])
    )
      keys.set(parts[1], { algorithm: parts[1], data: parts[2] })
  }
  return [...keys.values()]
}
export class Trust {
  private pending = new Map<string, Pending>()
  constructor(private ssh: OpenSSH) {}
  private saved(host: Host) {
    const alias = hostAlias(host)
    return parseKeys(
      readFileSync(this.ssh.knownHosts, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.startsWith(alias + ' '))
        .join('\n')
    )
  }
  async inspect(host: Host): Promise<TrustChallenge> {
    this.ssh.require()
    for (const [id, p] of this.pending) if (p.expires < Date.now()) this.pending.delete(id)
    if (this.pending.size > 100) throw new Error('待确认连接过多，请稍后重试。')
    const result = await runProcess(
      this.ssh.keyscan,
      ['-T', '5', '-p', String(host.port), '-t', 'ed25519,ecdsa,rsa', host.address],
      18000
    )
    const keys = parseKeys(result.stdout)
    if (!keys.length || result.reason)
      throw new Error(
        '无法获取主机指纹。请检查地址、公网连接端口、网络与 SSH 服务；尚未建立登录会话。'
      )
    const previous = this.saved(host)
    if (
      previous.length &&
      (keys.some((k) => previous.some((p) => p.algorithm === k.algorithm && p.data !== k.data)) ||
        !keys.some((k) => previous.some((p) => p.algorithm === k.algorithm && p.data === k.data)))
    ) {
      throw new Error(
        '主机指纹发生变化，已阻止连接。请通过云控制台或管理员核实身份。v0.1 不支持重装信任重置；应用没有修改原有信任记录或登录私钥。'
      )
    }
    const token = randomUUID()
    this.pending.set(token, {
      target: structuredClone(host),
      keys,
      expires: Date.now() + 300000,
      trusted: previous.length > 0
    })
    return this.challenge(token)
  }
  private get(token: string) {
    const p = this.pending.get(token)
    if (!p || p.expires < Date.now()) throw new Error('连接确认已过期，请重新打开连接。')
    return p
  }
  private challenge(token: string): TrustChallenge {
    const p = this.get(token)
    return {
      token,
      target: p.target,
      trusted: p.trusted,
      keys: p.keys.map((k) => ({
        algorithm: k.algorithm,
        fingerprint:
          'SHA256:' +
          createHash('sha256')
            .update(Buffer.from(k.data, 'base64'))
            .digest('base64')
            .replace(/=+$/, '')
      }))
    }
  }
  accept(token: string) {
    const p = this.get(token)
    if (!p.trusted) {
      const current = this.saved(p.target)
      if (
        current.length &&
        p.keys.some((k) => current.some((s) => s.algorithm === k.algorithm && s.data !== k.data))
      )
        throw new Error('信任记录已改变，请重新检查。')
      if (!current.length)
        appendFileSync(
          this.ssh.knownHosts,
          p.keys.map((k) => `${hostAlias(p.target)} ${k.algorithm} ${k.data}\n`).join('')
        )
      p.trusted = true
    }
    return this.challenge(token)
  }
  consume(token: string): Host {
    const p = this.get(token)
    if (!p.trusted) throw new Error('请先核对并信任服务器指纹。')
    this.pending.delete(token)
    return structuredClone(p.target)
  }
}
