import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import ssh2 from 'ssh2'
import {
  HostInput,
  Request,
  TerminalMessage,
  type Host,
  type Task
} from '../../packages/contracts/src'
import { Engine } from '../../packages/engine/src'
import { Store } from '../../packages/engine/src/storage'
import { OpenSSH, runProcess } from '../../packages/engine/src/ssh'
import { StartupMarker } from '../../packages/engine/src/sessions'
import { diagnostics } from '../../plugins/diagnostics/src'

const host = (port = 22): Host => ({
  id: randomUUID(),
  name: '合成本机测试',
  address: '127.0.0.1',
  port,
  sshdPort: 22,
  username: 'tester',
  auth: 'agent',
  keyPath: '',
  group: 'test',
  tags: [],
  notes: '',
  updatedAt: new Date().toISOString()
})
const { Server, utils } = ssh2
const until = async (predicate: () => boolean, timeout = 10000) => {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error('condition timed out')
    await new Promise((r) => setTimeout(r, 30))
  }
}
function temp() {
  return mkdtempSync(join(tmpdir(), 'supilot-test-'))
}
test('IPC rejects option injection, arbitrary methods, unknown fields, excessive terminal input and invalid dimensions', () => {
  const { updatedAt, ...draft } = host()
  assert.equal(HostInput.safeParse(draft).success, true)
  for (const address of [
    '-oProxyCommand=cmd',
    'host;echo bad',
    'host\nProxyCommand bad',
    'host name'
  ])
    assert.equal(HostInput.safeParse({ ...draft, address }).success, false)
  assert.equal(Request.safeParse({ type: 'exec', command: 'whoami' }).success, false)
  assert.equal(
    Request.safeParse({ type: 'host.save', host: { ...draft, password: 'must-not-store' } })
      .success,
    false
  )
  assert.equal(TerminalMessage.safeParse({ type: 'input', data: 'x'.repeat(65537) }).success, false)
  assert.equal(TerminalMessage.safeParse({ type: 'resize', cols: 0, rows: 10 }).success, false)
  assert.equal(TerminalMessage.safeParse({ type: 'input', data: '\x03\x04\x12中文' }).success, true)
  for (const address of ['example.com', '203.0.113.1', '2001:db8::1', '::1'])
    assert.equal(HostInput.safeParse({ ...draft, address }).success, true)
})
test('SQLite persists host snapshots; interrupted work becomes unknown on restart', () => {
  const directory = temp()
  const h = host(22022)
  let store = new Store(directory)
  try {
    store.saveHost(h)
    const task: Task = {
      id: randomUUID(),
      target: structuredClone(h),
      pluginId: 'diagnostics',
      title: 'test',
      state: 'running',
      createdAt: h.updatedAt,
      steps: [{ id: 'test', title: 'test', state: 'running', output: '' }]
    }
    store.saveTask(task)
    store.saveHost({ ...h, address: '192.0.2.1', port: 2222 })
    assert.equal(store.tasks()[0].target.port, 22022)
    store.close()
    store = new Store(directory)
    assert.equal(store.hosts()[0].port, 2222)
    assert.equal(store.tasks()[0].state, 'unknown')
    assert.equal(store.tasks()[0].steps[0].state, 'unknown')
    store.deleteHost(h.id)
    assert.equal(store.tasks()[0].target.id, h.id)
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
test('authentication marker tolerates every stream boundary and rejects banner lookalikes', () => {
  const marker = '\x1b]777;supilot-session:' + randomUUID() + '\x07'
  for (let i = 0; i <= marker.length; i++) {
    const reader = new StartupMarker(marker)
    const output =
      reader.consume('prefix' + marker.slice(0, i)) + reader.consume(marker.slice(i) + 'suffix')
    assert.equal(output, 'prefixsuffix')
    assert.equal(reader.confirmed, true)
  }
  const reader = new StartupMarker(marker)
  assert.equal(reader.consume('Authenticated to fake-server'), 'Authenticated to fake-server')
  assert.equal(reader.confirmed, false)
})
test('subprocess enforces timeout, cancellation, output cap and spawn failure', async () => {
  assert.equal(
    (await runProcess(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], 60)).reason,
    'timeout'
  )
  assert.equal(
    (await runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(200000))'])).reason,
    'limit'
  )
  const abort = new AbortController()
  const promise = runProcess(
    process.execPath,
    ['-e', 'setTimeout(()=>{},10000)'],
    10000,
    abort.signal
  )
  abort.abort()
  assert.equal((await promise).reason, 'cancel')
  assert.equal((await runProcess('supilot-not-a-real-executable', [])).reason, 'spawn')
})

test(
  'real system OpenSSH → loopback SSH fixture: trust, authentication, PTY, frozen target, diagnostics, changed key refusal',
  { timeout: 60000 },
  async () => {
    const directory = temp()
    const key = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' }
    }).privateKey
    let connections = 0,
      execCount = 0,
      shellCount = 0,
      shellInput = '',
      dimensions = { cols: 0, rows: 0 }
    const clients = new Set<any>()
    const login = join(directory, 'synthetic_login')
    const keygen = join(process.env.SystemRoot || 'C:\\Windows', 'System32/OpenSSH/ssh-keygen.exe')
    assert.equal(
      spawnSync(keygen, ['-q', '-t', 'ed25519', '-N', '', '-f', login], { windowsHide: true })
        .status,
      0
    )
    const parsed = utils.parseKey(readFileSync(login + '.pub'))
    assert.ok(!(parsed instanceof Error) && !Array.isArray(parsed))
    const expectedPublic = parsed.getPublicSSH()
    const server = new Server({ hostKeys: [key] }, (client) => {
      clients.add(client)
      connections++
      client.on('error', () => {})
      client.on('close', () => clients.delete(client))
      client.on('authentication', (ctx) => {
        if (
          ctx.method === 'publickey' &&
          ctx.username === 'tester' &&
          ctx.key.data.equals(expectedPublic)
        ) {
          if (!ctx.signature || (ctx.blob && parsed.verify(ctx.blob, ctx.signature, ctx.hashAlgo)))
            ctx.accept()
          else ctx.reject()
        } else ctx.reject(['publickey'])
      })
      client.on('ready', () =>
        client.on('session', (accept) => {
          const session = accept()
          session.on('pty', (accept, _reject, info) => {
            dimensions = { cols: info.cols, rows: info.rows }
            accept?.()
          })
          session.on('window-change', (accept, _reject, info) => {
            dimensions = { cols: info.cols, rows: info.rows }
            accept?.()
          })
          session.on('shell', (accept) => {
            shellCount++
            const stream = accept()
            stream.write('LOCAL FIXTURE READY 中文\r\nfixture$ ')
            stream.on('data', (chunk: Buffer) => {
              shellInput += chunk.toString()
              stream.write(chunk)
              if (shellInput.includes('exit')) {
                stream.exit(0)
                stream.end()
              }
            })
          })
          session.on('exec', (accept, _reject, info) => {
            const nonce = info.command.match(/supilot-session:([a-f0-9-]+)/)?.[1]
            if (nonce) {
              shellCount++
              const stream = accept()
              stream.write(
                `\x1b]777;supilot-session:${nonce}\x07LOCAL FIXTURE READY 中文\r\nfixture$ `
              )
              stream.on('data', (chunk: Buffer) => {
                shellInput += chunk.toString()
                stream.write(chunk)
                if (shellInput.includes('exit')) {
                  stream.exit(0)
                  stream.end()
                }
              })
              return
            }
            execCount++
            const stream = accept()
            stream.write(
              info.command.includes('os-release')
                ? 'PRETTY_NAME="Synthetic Debian fixture"\nLinux test\n'
                : info.command.includes('df -Pk')
                  ? '/dev/test 100 20 80 20% /\n'
                  : info.command.includes('meminfo')
                    ? 'MemTotal: 1024 kB\n'
                    : 'up 1 day\n'
            )
            stream.exit(0)
            stream.end()
          })
        })
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const engine = new Engine(join(directory, 'app data with spaces'), () => {})
    engine.register(diagnostics)
    try {
      const target = host(address.port)
      target.auth = 'key'
      target.keyPath = login
      const { updatedAt, ...draft } = target
      delete (draft as { id?: string }).id
      const saved = (await engine.handle({ type: 'host.save', host: draft })) as Host
      const challenge = await engine.trust.inspect(saved)
      assert.equal(challenge.trusted, false)
      assert.throws(() => engine.trust.consume(challenge.token), /先核对/)
      engine.trust.accept(challenge.token)
      engine.store.saveHost({ ...saved, port: 1, username: 'changed' })
      const session = await engine.sessions.open(engine.trust.consume(challenge.token))
      assert.equal(session.state, 'awaiting-auth')
      assert.equal(session.target.port, address.port)
      let output = ''
      const port = new EventEmitter() as any
      port.start = () => {}
      port.close = () => {}
      port.postMessage = (message: { type: string; data: string }) => {
        if (message.type === 'output') {
          output += message.data
          queueMicrotask(() =>
            port.emit('message', { data: { type: 'ack', count: message.data.length } })
          )
        }
      }
      engine.sessions.attach(session.id, port)
      await until(() => output.includes('LOCAL FIXTURE READY'))
      await until(() => session.state === 'authenticated')
      port.emit('message', { data: { type: 'resize', cols: 112, rows: 34 } })
      port.emit('message', { data: { type: 'input', data: '中文-PTY-INPUT\r' } })
      await until(() => shellInput.includes('中文-PTY-INPUT'))
      await until(() => dimensions.cols === 112 && dimensions.rows === 34)
      const shellBefore = shellInput
      const task = engine.tasks.start(saved, diagnostics)
      await until(() => engine.store.tasks().find((t) => t.id === task.id)?.state === 'succeeded')
      assert.equal(execCount, 4)
      assert.equal(shellCount, 1)
      assert.equal(shellInput, shellBefore)
      assert.equal(engine.store.tasks()[0].steps.length, 4)
      const failure = engine.tasks.start({ ...saved, username: 'wrong-user' }, diagnostics)
      await until(() => engine.store.tasks().find((t) => t.id === failure.id)?.state === 'failed')
      assert.match(
        engine.store.tasks().find((t) => t.id === failure.id)!.message!,
        /免交互认证不可用/
      )
      assert.equal(execCount, 4)
      port.emit('message', { data: { type: 'input', data: 'exit\r' } })
      await until(() => session.state === 'closed')
      engine.sessions.close(session.id)
      assert.equal(engine.sessions.list().length, 0)
      assert.ok(connections >= 7)
      // Replace only this fixture server's key; no system/user keys or known_hosts touched.
      for (const c of clients) c.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      const secondKey = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'pkcs1', format: 'pem' }
      }).privateKey
      const replacement = new Server({ hostKeys: [secondKey] }, (client) => {
        clients.add(client)
        client.on('error', () => {})
        client.on('close', () => clients.delete(client))
      })
      await new Promise<void>((resolve) => replacement.listen(address.port, '127.0.0.1', resolve))
      try {
        await assert.rejects(() => engine.trust.inspect(saved), /指纹发生变化/)
      } finally {
        for (const c of clients) c.destroy()
        await new Promise<void>((resolve) => replacement.close(() => resolve()))
      }
    } finally {
      await engine.shutdown()
      for (const c of clients) c.destroy()
      server.close()
      // This absolute temp directory was allocated by mkdtemp above; no user data is under it.
      rmSync(directory, { recursive: true, force: true })
    }
  }
)

test('task cancellation, unavailable checks and connection loss keep distinct outcomes', async () => {
  const directory = temp()
  const engine = new Engine(directory, () => {})
  engine.register(diagnostics)
  const original = engine.ssh.execute.bind(engine.ssh)
  try {
    engine.ssh.execute = async () => ({ code: 127, stdout: '', stderr: 'command unavailable' })
    let task = engine.tasks.start(host(), diagnostics)
    await until(() => engine.store.tasks().find((t) => t.id === task.id)?.state === 'succeeded')
    assert.equal(engine.store.tasks()[0].steps[0].state, 'unavailable')
    engine.ssh.execute = async () => ({ code: 255, stdout: '', stderr: 'Connection reset by peer' })
    task = engine.tasks.start(host(), diagnostics)
    await until(() => engine.store.tasks().find((t) => t.id === task.id)?.state === 'interrupted')
    assert.equal(engine.store.tasks()[0].steps[0].state, 'unknown')
    engine.ssh.execute = async () => ({
      code: -1,
      stdout: '',
      stderr: 'spawn failed',
      reason: 'spawn'
    })
    task = engine.tasks.start(host(), diagnostics)
    await until(() => engine.store.tasks().find((t) => t.id === task.id)?.state === 'failed')
    assert.equal(engine.store.tasks()[0].steps[0].state, 'failed')
    engine.ssh.execute = (_host, _command, signal) =>
      new Promise((resolve) =>
        signal.addEventListener(
          'abort',
          () => resolve({ code: -1, stdout: '', stderr: '', reason: 'cancel' }),
          { once: true }
        )
      )
    task = engine.tasks.start(host(), diagnostics)
    engine.tasks.cancel(task.id)
    assert.equal(engine.store.tasks()[0].state, 'cancel-requested')
    await until(() => engine.store.tasks().find((t) => t.id === task.id)?.state === 'unknown')
  } finally {
    engine.ssh.execute = original
    await engine.shutdown()
    rmSync(directory, { recursive: true, force: true })
  }
})
