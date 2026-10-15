import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI, Snapshot } from '@supilot/contracts'

const api: DesktopAPI = {
  request: (request) => ipcRenderer.invoke('supilot:request', request),
  subscribe: (callback) => {
    const listener = (_: unknown, snapshot: Snapshot) => callback(snapshot)
    ipcRenderer.on('supilot:snapshot', listener)
    return () => ipcRenderer.removeListener('supilot:snapshot', listener)
  },
  attachTerminal: (id) => ipcRenderer.invoke('supilot:terminal', id),
  chooseKey: () => ipcRenderer.invoke('supilot:key')
}
ipcRenderer.on('supilot:port', (event, id: string) => {
  window.postMessage({ type: 'supilot:terminal-port', id }, '*', event.ports)
})
contextBridge.exposeInMainWorld('supilot', api)
