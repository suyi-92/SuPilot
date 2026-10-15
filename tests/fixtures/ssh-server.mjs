import ssh2 from 'ssh2'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

// Deliberately synthetic server bound ONLY to loopback; never executes shell code.
// It tests OpenSSH/PTY/IPC transport, not a Debian/Ubuntu/Alpine installation.
export async function createSSHFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'supilot-e2e-'))
  const login = join(directory, 'login')
  const keygen = join(process.env.SystemRoot || 'C:\\Windows', 'System32/OpenSSH/ssh-keygen.exe')
  assert.equal(
    spawnSync(keygen, ['-q', '-t', 'ed25519', '-N', '', '-f', login], { windowsHide: true }).status,
    0
  )
  const parsed = ssh2.utils.parseKey(readFileSync(login + '.pub'))
  const privateKey = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' }
  }).privateKey
  const clients = new Set()
  const state = { input: '', shells: 0, execs: 0, dimensions: [] }
  const server = new ssh2.Server({ hostKeys: [privateKey] }, (client) => {
    clients.add(client)
    client.on('error', () => {})
    client.on('close', () => clients.delete(client))
    client.on('authentication', (ctx) => {
      if (
        ctx.method === 'publickey' &&
        ctx.username === 'tester' &&
        ctx.key.data.equals(parsed.getPublicSSH()) &&
        (!ctx.signature || parsed.verify(ctx.blob, ctx.signature, ctx.hashAlgo))
      )
        ctx.accept()
      else ctx.reject(['publickey'])
    })
    client.on('ready', () =>
      client.on('session', (accept) => {
        const session = accept()
        session.on('pty', (accept, _reject, size) => {
          state.dimensions.push(size)
          accept?.()
        })
        session.on('window-change', (accept, _reject, size) => {
          state.dimensions.push(size)
          accept?.()
        })
        session.on('exec', (accept, _reject, info) => {
          const stream = accept()
          const nonce = info.command.match(/supilot-session:([a-f0-9-]+)/)?.[1]
          if (nonce) {
            state.shells++
            stream.write(
              `\x1b]777;supilot-session:${nonce}\x07\x1b[32mLOOPBACK SSH FIXTURE\x1b[0m\r\n本机合成 SSH 服务 · 非真实 VPS\r\nfixture$ `
            )
            let buffer = ''
            stream.on('data', (chunk) => {
              const text = chunk.toString()
              state.input += text
              buffer += text
              stream.write(chunk)
              if (buffer.includes('fullscreen')) {
                stream.write('\x1b[?1049h\x1b[2J\x1b[HFULL SCREEN FIXTURE\r\n中文全屏测试\r\n')
                buffer = ''
              }
              if (buffer.includes('leave-screen')) {
                stream.write('\x1b[?1049l\r\nfixture$ ')
                buffer = ''
              }
              if (buffer.includes('bulk-output')) {
                stream.write('bounded-output-row\r\n'.repeat(12000) + 'OUTPUT_END\r\n')
                buffer = ''
              }
              if (buffer.includes('exit-fixture')) {
                stream.exit(0)
                stream.end()
              }
            })
          } else {
            state.execs++
            stream.write(
              info.command.includes('os-release')
                ? 'PRETTY_NAME="Synthetic Linux fixture"\nLinux fixture\n'
                : info.command.includes('df -Pk')
                  ? '/dev/fixture 1000 200 800 20% /\n'
                  : info.command.includes('meminfo')
                    ? 'MemTotal: 2048 kB\n'
                    : 'up 1 day\n'
            )
            stream.exit(0)
            stream.end()
          }
        })
      })
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    port: server.address().port,
    login,
    state,
    async close() {
      for (const client of clients) client.destroy()
      await new Promise((resolve) => server.close(resolve))
      // directory is the exact mkdtemp allocation above, containing only synthetic keys.
      rmSync(directory, { recursive: true, force: true })
    }
  }
}
