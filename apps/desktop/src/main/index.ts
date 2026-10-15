import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MessageChannelMain,
  utilityProcess,
  type UtilityProcess,
  type IpcMainInvokeEvent
} from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { Request, activeSession, activeTask, type Snapshot } from '@supilot/contracts'

const profile =
  process.env.SUPILOT_TEST === '1' ? 'SuPilot-test' : app.isPackaged ? 'SuPilot' : 'SuPilot-dev'
app.setPath('userData', join(app.getPath('appData'), profile))
mkdirSync(app.getPath('userData'), { recursive: true })
app.setName('SuPilot')
if (!app.requestSingleInstanceLock()) app.exit(0)
let window: BrowserWindow
app.on('second-instance', () => {
  if (window) {
    if (window.isMinimized()) window.restore()
    window.focus()
  }
})
let engine: UtilityProcess
let snapshot: Snapshot | undefined
let quitting = false,
  stopping = false,
  closePrompt = false,
  engineFailed = false
const pending = new Map<
  string,
  { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
>()
const rendererFile = join(import.meta.dirname, '../renderer/index.html')
const rendererURL =
  !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).href
    : pathToFileURL(rendererFile).href
function authorize(event: IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame?.url !== rendererURL
  )
    throw new Error('拒绝未授权的 IPC 来源。')
}
function call(request: unknown): Promise<any> {
  if (engineFailed)
    return Promise.reject(new Error('Engine 已停止，请重启应用。运行中任务的结果需要重新确认。'))
  if (pending.size >= 32) return Promise.reject(new Error('请求过多，请稍后重试。'))
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('后台响应超时，请检查 Engine 状态。'))
    }, 25000)
    pending.set(id, { resolve, reject, timer })
    engine.postMessage({ type: 'request', id, request })
  })
}
async function shutdown() {
  if (stopping) return
  stopping = true
  if (!engineFailed) {
    engine.postMessage({ type: 'shutdown' })
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 4000)
      engine.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    engine.kill()
  }
  quitting = true
  app.quit()
}
app.on('before-quit', (event) => {
  if (!quitting) {
    event.preventDefault()
    window?.close()
  }
})
app.on('window-all-closed', () => {
  void shutdown()
})
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  engine = utilityProcess.fork(join(import.meta.dirname, 'engine.js'), [app.getPath('userData')], {
    serviceName: 'SuPilot Engine',
    stdio: 'pipe'
  })
  engine.stderr?.on('data', (d) => process.stderr.write(d))
  engine.on('message', (message) => {
    if (message.type === 'reply') {
      const p = pending.get(message.id)
      if (p) {
        clearTimeout(p.timer)
        pending.delete(message.id)
        message.error ? p.reject(new Error(message.error)) : p.resolve(message.result)
      }
    } else if (message.type === 'ready' || message.type === 'snapshot') {
      snapshot = message.snapshot
      if (window && !window.isDestroyed()) window.webContents.send('supilot:snapshot', snapshot)
    }
  })
  engine.on('exit', () => {
    engineFailed = true
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error('Engine 意外退出，请重启应用。'))
    }
    pending.clear()
    if (!stopping && snapshot && window && !window.isDestroyed()) {
      snapshot.engineError = 'Engine 意外退出。会话已不可用，进行中任务的远端结果未知，请重启应用。'
      snapshot.sessions.forEach((s) => {
        if (activeSession(s)) s.state = 'interrupted'
      })
      snapshot.tasks.forEach((t) => {
        if (activeTask(t)) t.state = 'unknown'
      })
      window.webContents.send('supilot:snapshot', snapshot)
    }
  })
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 850,
    minHeight: 600,
    title: 'SuPilot',
    backgroundColor: '#171A20',
    icon: join(import.meta.dirname, '../../resources/icon.png'),
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  const clipboardPermissions = new Set(['clipboard-read', 'clipboard-sanitized-write'])
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback) =>
    callback(
      contents === window.webContents &&
        contents.getURL() === rendererURL &&
        clipboardPermissions.has(permission)
    )
  )
  window.webContents.session.setPermissionCheckHandler(
    (contents, permission) =>
      contents === window.webContents &&
      contents.getURL() === rendererURL &&
      clipboardPermissions.has(permission)
  )
  ipcMain.handle('supilot:request', (event, raw) => {
    authorize(event)
    return call(Request.parse(raw))
  })
  ipcMain.handle('supilot:key', async (event) => {
    authorize(event)
    const result = await dialog.showOpenDialog(window, {
      title: '选择已有 SSH 私钥（只保存路径引用）',
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('supilot:terminal', (event, id) => {
    authorize(event)
    if (typeof id !== 'string' || !snapshot?.sessions.some((s) => s.id === id))
      throw new Error('会话不存在。')
    const { port1, port2 } = new MessageChannelMain()
    engine.postMessage({ type: 'terminal', id }, [port1])
    window.webContents.postMessage('supilot:port', id, [port2])
  })
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    if (closePrompt || stopping) return
    const sessions = snapshot?.sessions.filter(activeSession).length ?? 0
    const tasks = snapshot?.tasks.filter(activeTask).length ?? 0
    if (!sessions && !tasks) {
      void shutdown()
      return
    }
    closePrompt = true
    void dialog
      .showMessageBox(window, {
        type: 'question',
        title: '退出 SuPilot',
        message: `仍有 ${sessions} 个终端会话和 ${tasks} 个任务。`,
        detail:
          '退出将关闭本地 SSH 与任务进程。远端程序可能继续运行，未完成的诊断结果将标记为未知。',
        buttons: ['继续使用', '关闭会话并退出'],
        defaultId: 0,
        cancelId: 0
      })
      .then((result) => {
        closePrompt = false
        if (result.response === 1) void shutdown()
      })
  })
  window.webContents.on('render-process-gone', () => {
    void shutdown()
  })
  await window.loadURL(rendererURL)
  window.show()
})
