const { app, BrowserWindow } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
// Test-only Electron host. No application preload, IPC, Engine or user profile.
app.setPath('userData', mkdtempSync(join(tmpdir(), 'supilot-round31-')))
app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 900, height: 650, minWidth: 850, minHeight: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: true } })
  // The runner installs the isolated API before navigating to the actual App.
  window.loadURL('about:blank')
})
app.on('window-all-closed', () => app.quit())
