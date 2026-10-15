import { useEffect, useRef } from 'react'
import { Terminal as XTerm, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Session } from '@supilot/contracts'
import { IconButton, Status } from '@supilot/ui'
import { Copy, Clipboard, TerminalSquare, X } from 'lucide-react'
import { useUI } from '../../app/state'
import { demoTerminal } from '../../app/demo'
import '@xterm/xterm/css/xterm.css'

const graphite: ITheme = {
  background: '#101216',
  foreground: '#d4dbe7',
  cursor: '#8bb2ff',
  selectionBackground: '#34435c',
  black: '#282d36',
  red: '#e7888e',
  green: '#7dceb0',
  yellow: '#e3bb74',
  blue: '#7aa5f5',
  magenta: '#b9a0e9',
  cyan: '#7ec8d4',
  white: '#d4dbe7',
  brightBlack: '#8290a4',
  brightRed: '#ffacb1',
  brightGreen: '#9de5c6',
  brightYellow: '#f5d39b',
  brightBlue: '#a4c2ff',
  brightMagenta: '#d4b7ff',
  brightCyan: '#a5e1ea',
  brightWhite: '#f2f5fa'
}
const classic: ITheme = {
  ...graphite,
  green: '#91cf7b',
  blue: '#82aaff',
  yellow: '#ffd580',
  red: '#ff757f'
}
export function TerminalPane({
  session,
  visible,
  focused,
  onFocus,
  onClose,
  report,
  index
}: {
  session: Session
  visible: boolean
  focused: boolean
  onFocus: () => void
  onClose: () => void
  report: (message: string) => void
  index: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const terminal = useRef<XTerm>(null)
  const port = useRef<MessagePort>(null)
  const fit = useRef<FitAddon>(null)
  const settings = useUI()
  useEffect(() => {
    const term = new XTerm({
      theme: settings.ansi === 'classic' ? classic : graphite,
      fontFamily: 'Cascadia Mono, Consolas, Microsoft YaHei, monospace',
      fontSize: settings.terminalSize,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: false,
      allowTransparency: false,
      disableStdin: !!session.demo
    })
    const addon = new FitAddon()
    term.loadAddon(addon)
    term.open(container.current!)
    terminal.current = term
    fit.current = addon
    let disposed = false
    const sendSize = () =>
      port.current?.postMessage({
        type: 'resize',
        cols: Math.min(500, Math.max(2, term.cols)),
        rows: Math.min(300, Math.max(1, term.rows))
      })
    const size = term.onResize(sendSize)
    const resize = () => {
      if (!container.current?.clientWidth || !container.current?.clientHeight || disposed) return
      addon.fit()
      sendSize()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container.current!)
    const input = term.onData((data) => {
      // Split large paste into bounded channel messages, keeping shell control bytes untouched.
      for (let i = 0; i < data.length; i += 32768)
        port.current?.postMessage({ type: 'input', data: data.slice(i, i + 32768) })
    })
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        void navigator.clipboard
          .writeText(term.getSelection())
          .catch(() => report('复制失败，请检查剪贴板权限。'))
        return false
      }
      if (event.type === 'keydown' && event.ctrlKey && event.shiftKey && event.code === 'KeyV') {
        void navigator.clipboard
          .readText()
          .then((t) => term.paste(t))
          .catch(() => report('粘贴失败，请检查剪贴板权限。'))
        return false
      }
      return true
    })
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.data?.type !== 'supilot:terminal-port' ||
        event.data.id !== session.id ||
        !event.ports[0]
      )
        return
      port.current = event.ports[0]
      port.current.onmessage = (e) => {
        if (e.data?.type === 'output' && typeof e.data.data === 'string') {
          const text = e.data.data
          term.write(text, () => {
            if (!disposed) port.current?.postMessage({ type: 'ack', count: text.length })
          })
        }
      }
      port.current.start()
      resize()
    }
    window.addEventListener('message', receive)
    if (session.demo) term.write(demoTerminal(session.target, index))
    else void window.supilot.attachTerminal(session.id).catch((e) => report(String(e)))
    resize()
    return () => {
      disposed = true
      window.removeEventListener('message', receive)
      observer.disconnect()
      input.dispose()
      size.dispose()
      port.current?.close()
      port.current = null
      term.dispose()
      terminal.current = null
    }
  }, [session.id])
  useEffect(() => {
    if (terminal.current) {
      terminal.current.options.fontSize = settings.terminalSize
      terminal.current.options.theme = settings.ansi === 'classic' ? classic : graphite
      if (visible) fit.current?.fit()
    }
  }, [settings.terminalSize, settings.ansi, visible])
  useEffect(() => {
    if (visible && focused) terminal.current?.focus()
  }, [visible, focused])
  return (
    <section
      className={`terminal-pane ${focused ? 'focused' : ''}`}
      onMouseDown={onFocus}
      onFocus={onFocus}
    >
      <header className="pane-header">
        <TerminalSquare size={14} />
        <span className="truncate">{session.target.name}</span>
        <span className="pane-user">{session.target.username}</span>
        <span className="flex-1" />
        {session.demo ? (
          <span className="demo-label">模拟 · 未连接</span>
        ) : (
          <Status state={session.state} />
        )}
        <IconButton
          label="复制所选文本 · Ctrl+Shift+C"
          onClick={() =>
            void navigator.clipboard
              .writeText(terminal.current?.getSelection() || '')
              .catch(() => report('复制失败。'))
          }
        >
          <Copy size={14} />
        </IconButton>
        <IconButton
          label="粘贴 · Ctrl+Shift+V"
          disabled={session.demo}
          onClick={() =>
            void navigator.clipboard
              .readText()
              .then((t) => terminal.current?.paste(t))
              .catch(() => report('无法读取剪贴板。'))
          }
        >
          <Clipboard size={14} />
        </IconButton>
        <IconButton label={`关闭窗格 ${session.target.name}`} onClick={onClose}>
          <X size={14} />
        </IconButton>
      </header>
      <div className="xterm-container" ref={container} />
      {!session.demo && session.state !== 'authenticated' && (
        <div
          className={`terminal-notice ${session.state === 'failed' || session.state === 'interrupted' ? 'error' : ''}`}
        >
          <Status state={session.state} />
          <span>{session.message}</span>
        </div>
      )}
    </section>
  )
}
