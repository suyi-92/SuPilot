// Executed only by the E2E runner, inside an Electron utilityProcess.
// Resolves native dependencies from the actual application (including app.asar).
const { createRequire } = require('node:module')
const { join } = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const requireApp = createRequire(join(process.argv[2], 'package.json'))
const pty = requireApp('node-pty')
const db = new DatabaseSync(join(process.argv[3], 'native-verification.sqlite'))
db.exec(
  "CREATE TABLE IF NOT EXISTS smoke(value TEXT); DELETE FROM smoke; INSERT INTO smoke VALUES ('SQLite in packaged utilityProcess');"
)
const sqlite = db.prepare('SELECT value FROM smoke').get().value
db.close()
const terminal = pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile'], {
  name: 'xterm-256color',
  cols: 90,
  rows: 25,
  useConpty: true
})
let output = '',
  started = false,
  longPaste = false
const timeout = setTimeout(() => {
  terminal.kill()
  process.parentPort.postMessage({ type: 'failure', error: 'ConPTY timed out', output })
  process.exit(1)
}, 20000)
terminal.onData((data) => {
  output = (output + data).slice(-262144)
  if (!started && /PS /.test(output)) {
    started = true
    terminal.resize(111, 33)
    terminal.write(
      "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Write-Output ('SUPILOT_' + 'PTY_OK'); Write-Output ('中文' + '输入验证'); Write-Output ($Host.UI.RawUI.WindowSize.Width); Write-Output ('\\x1b[2J\\x1b[H')\r"
    )
  }
  if (!longPaste && /SUPILOT_PTY_OK/.test(output)) {
    longPaste = true
    terminal.write(
      "$p='" +
        'long-paste-'.repeat(1000) +
        "'; Write-Output ('PASTE_LENGTH=' + $p.Length); Write-Output ('NATIVE_' + 'DONE'); exit\r"
    )
  }
})
terminal.onExit((event) => {
  clearTimeout(timeout)
  process.parentPort.postMessage({
    type: 'result',
    versions: process.versions,
    sqlite,
    output,
    exitCode: event.exitCode,
    passed:
      event.exitCode === 0 &&
      /SUPILOT_PTY_OK/.test(output) &&
      /中文输入验证/.test(output) &&
      /\r?\n111\r?\n/.test(output) &&
      /PASTE_LENGTH=11000/.test(output) &&
      /NATIVE_DONE/.test(output)
  })
  process.exit(0)
})
