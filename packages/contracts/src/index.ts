import { z } from 'zod'

export const HostInput = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(100),
    address: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9.:_%\-]*$|^::[a-fA-F0-9:]+$/,
        '请输入域名、IPv4 或不带方括号的 IPv6 地址'
      ),
    port: z.number().int().min(1).max(65535),
    sshdPort: z.number().int().min(1).max(65535).nullable(),
    username: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.@\-]*$/),
    auth: z.enum(['agent', 'key']),
    keyPath: z
      .string()
      .max(1024)
      .refine((v) => !/[\r\n\0]/.test(v)),
    group: z.string().trim().max(60),
    tags: z.array(z.string().trim().min(1).max(32)).max(16),
    notes: z.string().max(4000)
  })
  .strict()
  .refine(
    (h) => h.auth !== 'key' || /^(?:[a-zA-Z]:[\\/]|\/)/.test(h.keyPath),
    '私钥引用须为现有文件的绝对路径'
  )
export type HostDraft = z.infer<typeof HostInput>
export type Host = HostDraft & { id: string; updatedAt: string }
export type SessionState = 'awaiting-auth' | 'authenticated' | 'closed' | 'failed' | 'interrupted'
export type Session = {
  id: string
  target: Host
  state: SessionState
  createdAt: string
  message?: string
  demo?: boolean
}
export type TaskState =
  'running' | 'succeeded' | 'failed' | 'cancel-requested' | 'cancelled' | 'interrupted' | 'unknown'
export type StepState = 'pending' | 'running' | 'succeeded' | 'unavailable' | 'failed' | 'unknown'
export type Step = {
  id: string
  title: string
  state: StepState
  output: string
  exitCode?: number
}
export type Task = {
  id: string
  pluginId: string
  title: string
  target: Host
  state: TaskState
  createdAt: string
  finishedAt?: string
  steps: Step[]
  message?: string
  demo?: boolean
}
export type PluginInfo = {
  id: string
  name: string
  description: string
  version: string
  readOnly: boolean
}
export type Snapshot = {
  hosts: Host[]
  sessions: Session[]
  tasks: Task[]
  plugins: PluginInfo[]
  sshAvailable: boolean
  dataPath: string
  engineError?: string
}
export type TrustChallenge = {
  token: string
  target: Host
  keys: { algorithm: string; fingerprint: string }[]
  trusted: boolean
}
export const Request = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot') }).strict(),
  z.object({ type: z.literal('host.save'), host: HostInput }).strict(),
  z.object({ type: z.literal('host.delete'), id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('trust.inspect'),
      hostId: z.string().uuid(),
      target: HostInput.optional()
    })
    .strict(),
  z.object({ type: z.literal('trust.accept'), token: z.string().uuid() }).strict(),
  z.object({ type: z.literal('session.open'), token: z.string().uuid() }).strict(),
  z.object({ type: z.literal('session.close'), id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('task.run'),
      token: z.string().uuid(),
      pluginId: z.string().min(1).max(80)
    })
    .strict(),
  z.object({ type: z.literal('task.cancel'), id: z.string().uuid() }).strict()
])
export type Request = z.infer<typeof Request>
export type ResultMap = {
  snapshot: Snapshot
  'host.save': Host
  'host.delete': null
  'trust.inspect': TrustChallenge
  'trust.accept': TrustChallenge
  'session.open': Session
  'session.close': null
  'task.run': Task
  'task.cancel': null
}
export const TerminalMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input'), data: z.string().max(65536) }).strict(),
  z
    .object({
      type: z.literal('resize'),
      cols: z.number().int().min(2).max(500),
      rows: z.number().int().min(1).max(300)
    })
    .strict(),
  z.object({ type: z.literal('ack'), count: z.number().int().min(1).max(262144) }).strict()
])
export interface DesktopAPI {
  request<T extends Request>(request: T): Promise<ResultMap[T['type']]>
  subscribe(callback: (snapshot: Snapshot) => void): () => void
  attachTerminal(id: string): Promise<void>
  chooseKey(): Promise<string | null>
}
export const activeSession = (s: Session) =>
  s.state === 'awaiting-auth' || s.state === 'authenticated'
export const activeTask = (t: Task) => t.state === 'running' || t.state === 'cancel-requested'
