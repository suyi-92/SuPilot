import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

export type SshConfigHost = {
  alias: string
  hostname: string
  port: number
  username: string
  identityFile: string
  proxyCommand?: string
  configPath: string
}

type Block = {
  patterns: string[]
  values: Map<string, string[]>
}

const value = (block: Block, key: string, next: string) => {
  const values = block.values.get(key) || []
  values.push(next)
  block.values.set(key, values)
}

function withoutComment(line: string) {
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if ((char === '"' || char === "'") && (!i || line[i - 1] !== '\\'))
      quote = quote === char ? '' : quote || char
    if (char === '#' && !quote && (!i || /\s/.test(line[i - 1]))) return line.slice(0, i)
  }
  return line
}

function unquote(text: string) {
  const value = text.trim()
  return value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
    ? value.slice(1, -1)
    : value
}

function patternMatches(pattern: string, alias: string) {
  const negative = pattern.startsWith('!')
  const source = negative ? pattern.slice(1) : pattern
  const expression = source
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return { negative, matched: new RegExp(`^${expression}$`, 'i').test(alias) }
}

function blockMatches(patterns: string[], alias: string) {
  let matched = false
  for (const pattern of patterns) {
    const result = patternMatches(pattern, alias)
    if (result.negative && result.matched) return false
    if (!result.negative && result.matched) matched = true
  }
  return matched
}

function expandInclude(valueText: string, base: string) {
  const raw = unquote(valueText)
  const expanded = raw.replace(/^~(?=$|[\\/])/, homedir()).replace(/%d/g, homedir())
  const path = isAbsolute(expanded) ? expanded : resolve(base, expanded)
  if (!/[?*]/.test(path)) return existsSync(path) ? [path] : []
  const folder = dirname(path)
  const pattern = basename(path)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((entry) => new RegExp(`^${pattern}$`, 'i').test(entry))
    .map((entry) => join(folder, entry))
    .filter((entry) => statSync(entry).isFile())
}

function readBlocks(file: string, seen: Set<string>, depth = 0): Block[] {
  if (depth > 8 || seen.has(file) || !existsSync(file)) return []
  seen.add(file)
  const blocks: Block[] = [{ patterns: [], values: new Map() }]
  let current = blocks[0]
  for (const original of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = withoutComment(original).trim()
    if (!line) continue
    const match = line.match(/^(\S+)\s+(.*)$/)
    if (!match) continue
    const key = match[1].toLowerCase()
    const rest = match[2].trim()
    if (key === 'host') {
      current = { patterns: rest.split(/\s+/).map(unquote), values: new Map() }
      blocks.push(current)
      continue
    }
    if (key === 'include') {
      for (const include of rest.split(/\s+/).flatMap((item) => expandInclude(item, dirname(file))))
        blocks.push(...readBlocks(include, seen, depth + 1))
      continue
    }
    value(current, key, unquote(rest))
  }
  return blocks
}

function first(values: Map<string, string[]>, key: string) {
  return values.get(key)?.[0]
}

function expandIdentity(path: string, alias: string, hostname: string) {
  const expanded = path
    .replace(/^~(?=$|[\\/])/, homedir())
    .replace(/%d/g, homedir())
    .replace(/%h/g, hostname)
    .replace(/%r/g, userInfo().username)
    .replace(/%u/g, userInfo().username)
    .replace(/%n/g, alias)
  return isAbsolute(expanded)
    ? expanded
    : resolve(dirname(join(homedir(), '.ssh', 'config')), expanded)
}

export function discoverSshConfig(configPath = join(homedir(), '.ssh', 'config')): SshConfigHost[] {
  if (!existsSync(configPath)) return []
  const blocks = readBlocks(configPath, new Set())
  const aliases = new Set<string>()
  for (const block of blocks) {
    for (const pattern of block.patterns)
      if (
        !pattern.startsWith('!') &&
        !/[*!?]/.test(pattern) &&
        /^[A-Za-z0-9_.:@-]+$/.test(pattern) &&
        !pattern.startsWith('-')
      )
        aliases.add(pattern)
  }
  const discovered: SshConfigHost[] = []
  for (const alias of aliases) {
    const effective = new Map<string, string[]>()
    for (const block of blocks) {
      if (block.patterns.length && !blockMatches(block.patterns, alias)) continue
      for (const [key, values] of block.values) if (!effective.has(key)) effective.set(key, values)
    }
    const hostname = first(effective, 'hostname') || alias
    const portValue = Number(first(effective, 'port') || 22)
    const identity = first(effective, 'identityfile')
    discovered.push({
      alias,
      hostname,
      port: Number.isInteger(portValue) && portValue >= 1 && portValue <= 65535 ? portValue : 22,
      username: first(effective, 'user') || userInfo().username || process.env.USERNAME || 'user',
      identityFile:
        identity && identity.toLowerCase() !== 'none'
          ? expandIdentity(identity, alias, hostname)
          : '',
      proxyCommand: first(effective, 'proxycommand'),
      configPath
    })
  }
  return discovered
}
