import { Engine } from '@supilot/engine'
import { diagnostics } from '@supilot/plugin-diagnostics'

// Electron utilityProcess transport is the only platform concern in this entrypoint.
const parent = process.parentPort!
const engine = new Engine(
  process.argv[2],
  (snapshot) => parent.postMessage({ type: 'snapshot', snapshot }),
  { sshConfigPath: process.env.SUPILOT_TEST === '1' ? null : undefined }
)
engine.register(diagnostics)
parent.on('message', async (event) => {
  const m = event.data
  if (m.type === 'shutdown') {
    await engine.shutdown()
    process.exit(0)
  }
  if (m.type === 'terminal') {
    try {
      engine.sessions.attach(m.id, event.ports[0])
    } catch {
      event.ports[0]?.close()
    }
    return
  }
  if (m.type !== 'request') return
  try {
    parent.postMessage({ type: 'reply', id: m.id, result: await engine.handle(m.request) })
  } catch (error) {
    parent.postMessage({
      type: 'reply',
      id: m.id,
      error: error instanceof Error ? error.message : String(error)
    })
  }
})
parent.postMessage({ type: 'ready', snapshot: engine.snapshot() })
