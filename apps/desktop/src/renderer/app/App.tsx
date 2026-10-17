import { useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  Activity,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  ClipboardList,
  Columns2,
  Compass,
  Copy,
  Edit3,
  FlaskConical,
  Folder,
  Info,
  Keyboard,
  Layers3,
  LoaderCircle,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Rows2,
  RadioTower,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react'
import {
  activeSession,
  activeTask,
  type DesktopAPI,
  type Host,
  type HostDraft,
  type Session,
  type Snapshot,
  type TrustChallenge
} from '@supilot/contracts'
import { Button, Dialog, IconButton, SidePanel, Status, TooltipProvider } from '@supilot/ui'
import { useUI } from './state'
import { demoSnapshot } from './demo'
import { TerminalPane } from '../features/terminal/Terminal'
import { HostForm, draftOf } from '../features/hosts/HostForm'
import { Operations } from '../features/operations/Operations'
import { TasksPage, time } from '../features/tasks/Tasks'
import { QuickOpen } from './QuickOpen'
import { endpoint } from './format'
import { snapshotLoadState } from './snapshotState'

declare global {
  interface Window {
    supilot: DesktopAPI
  }
}
type Tab =
  | {
      id: string
      kind: 'terminal'
      title: string
      sessionIds: string[]
      focused: string
      direction: 'horizontal' | 'vertical'
    }
  | { id: string; kind: 'operation'; title: string; host?: Host; plugin: string }
  | { id: string; kind: 'host'; title: string; host?: Host; dirty?: boolean }
  | { id: string; kind: 'tasks'; title: string; taskId?: string; selectionVersion?: number }
type ConnectionIntent = {
  host: Host
  kind: 'session' | 'task'
  split?: { tabId: string; direction: 'horizontal' | 'vertical' }
}
const empty: Snapshot = {
  hosts: [],
  sessions: [],
  tasks: [],
  plugins: [],
  sshAvailable: false,
  dataPath: ''
}

export function App() {
  const ui = useUI()
  const [real, setReal] = useState<Snapshot>(empty)
  const [demo, setDemo] = useState(false)
  const [sample, setSample] = useState<Snapshot>(demoSnapshot)
  const [loading, setLoading] = useState(true)
  const [snapshotReady, setSnapshotReady] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string>()
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState('')
  const [selectedHost, setSelectedHost] = useState('')
  const [search, setSearch] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; kind: 'error' | 'success' }>()
  const [quickOpen, setQuickOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 1250)
  const [detailsPeek, setDetailsPeek] = useState(false)
  const [settings, setSettings] = useState(false)
  const [trust, setTrust] = useState<{ challenge: TrustChallenge; intent: ConnectionIntent }>()
  const [confirm, setConfirm] = useState<{
    title: string
    text: string
    action: () => Promise<void>
  }>()
  const mode = useRef(false)
  const data = demo ? sample : real
  const current = tabs.find((t) => t.id === active)
  const currentSession =
    current?.kind === 'terminal' ? data.sessions.find((s) => s.id === current.focused) : undefined
  const target =
    current?.kind === 'operation' || current?.kind === 'host'
      ? current.host
      : current?.kind === 'terminal'
        ? currentSession?.target
        : current?.kind === 'tasks'
          ? data.tasks.find((t) => t.id === current.taskId)?.target
          : data.hosts.find((h) => h.id === selectedHost)
  const selected = data.hosts.find((h) => h.id === selectedHost)
  // The activity-rail diagnostic follows the list selection when present;
  // terminal/detail actions continue to use their fixed tab target.
  const activityTarget = selected || target
  const targetContext =
    current?.kind === 'terminal'
      ? '当前会话目标'
      : current?.kind === 'operation'
        ? '当前操作目标'
        : current?.kind === 'tasks'
          ? '当前任务目标'
          : current?.kind === 'host'
            ? '当前表单目标'
            : '列表选中主机'
  const activeCount = data.sessions.filter(activeSession).length
  const running = data.tasks.filter(activeTask).length
  const attention = data.tasks.filter((t) =>
    ['failed', 'unknown', 'interrupted'].includes(t.state)
  ).length
  const detailsVisible = !ui.focus && (narrow ? detailsPeek : ui.details)
  const welcomeHost = data.hosts.find((host) => host.id === selectedHost) || data.hosts[0]
  const loadState = snapshotLoadState(loading, snapshotReady, snapshotError)
  const report = (message: string, kind: 'error' | 'success' = 'error') =>
    setToast({
      message: message.replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, ''),
      kind
    })
  useEffect(() => {
    const media = matchMedia('(max-width: 1250px)')
    const change = () => {
      setNarrow(media.matches)
      setDetailsPeek(false)
    }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    let mounted = true
    let subscribedSnapshot = false
    const acceptSnapshot = (snapshot: Snapshot) => {
      if (!mounted) return
      setReal(snapshot)
      setSnapshotReady(true)
      setSnapshotError(undefined)
      setLoading(false)
    }
    const off = window.supilot.subscribe((snapshot) => {
      subscribedSnapshot = true
      acceptSnapshot(snapshot)
    })
    void window.supilot
      .request({ type: 'snapshot' })
      .then((snapshot) => {
        if (!subscribedSnapshot) acceptSnapshot(snapshot)
      })
      .catch((e) => {
        if (mounted && !subscribedSnapshot) {
          setSnapshotError(String(e))
          setLoading(false)
        }
      })
    return () => { mounted = false; off() }
  }, [])
  useEffect(() => {
    if (!demo && !selectedHost && real.hosts.length) {
      setSelectedHost(
        real.hosts.find((host) => host.source === 'ssh-config')?.id ||
          real.hosts.find((host) => host.local)?.id ||
          real.hosts[0].id
      )
    }
  }, [demo, real.hosts, selectedHost])
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font-size', `${ui.uiSize}px`)
  }, [ui.uiSize])
  useEffect(() => {
    if (toast?.kind !== 'success') return
    const timer = setTimeout(() => setToast(undefined), 4500)
    return () => clearTimeout(timer)
  }, [toast])
  function addTab(tab: Tab) {
    setTabs((v) => [...v, tab])
    setActive(tab.id)
  }
  function openEditor(host?: Host) {
    setDetailsPeek(false)
    ui.set({ tasks: false })
    const existing = tabs.find((t) => t.kind === 'host' && t.host?.id === host?.id)
    if (existing) {
      setActive(existing.id)
      return
    }
    addTab({
      id: crypto.randomUUID(),
      kind: 'host',
      title: host ? `编辑 · ${host.name}` : '添加主机',
      host: host && structuredClone(host)
    })
  }
  function openOperation(host: Host | undefined, plugin = 'diagnostics') {
    setDetailsPeek(false)
    ui.set({ tasks: false })
    const existing = tabs.find(
      (t) => t.kind === 'operation' && t.host?.id === host?.id && t.plugin === plugin
    )
    if (existing) {
      setActive(existing.id)
      return
    }
    addTab({
      id: crypto.randomUUID(),
      kind: 'operation',
      title: plugin === 'diagnostics' ? '系统诊断' : plugin === 'surelay' ? 'SuRelay' : 'Access',
      host: host && structuredClone(host),
      plugin
    })
  }
  function openTasks(id?: string) {
    setDetailsPeek(false)
    ui.set({ tasks: false })
    const existing = tabs.find((t) => t.kind === 'tasks')
    if (existing) {
      if (id)
        setTabs((v) =>
          v.map((t) =>
            t.id === existing.id && t.kind === 'tasks'
              ? { ...t, taskId: id, selectionVersion: (t.selectionVersion || 0) + 1 }
              : t
          )
        )
      setActive(existing.id)
    } else
      addTab({
        id: crypto.randomUUID(),
        kind: 'tasks',
        title: '任务记录',
        taskId: id || data.tasks[0]?.id
      })
  }
  function removeTab(id: string) {
    setTabs((v) => v.filter((t) => t.id !== id))
    if (active === id) {
      const index = tabs.findIndex((t) => t.id === id)
      setActive(tabs[index - 1]?.id || tabs[index + 1]?.id || '')
    }
  }
  async function closeSession(id: string, tabId: string) {
    if (demo) setSample((v) => ({ ...v, sessions: v.sessions.filter((s) => s.id !== id) }))
    else await window.supilot.request({ type: 'session.close', id })
    const tab = tabs.find((t) => t.id === tabId)
    if (tab?.kind === 'terminal') {
      const next = tab.sessionIds.filter((s) => s !== id)
      if (!next.length) removeTab(tab.id)
      else
        setTabs((v) =>
          v.map((t) => (t.id === tab.id ? { ...tab, sessionIds: next, focused: next[0] } : t))
        )
    }
  }
  function requestCloseSession(id: string, tabId: string) {
    const session = data.sessions.find((s) => s.id === id)
    if (!demo && session && activeSession(session))
      setConfirm({
        title: '关闭终端会话',
        text: `${session.target.username}@${session.target.address} 的本地 SSH 会话将关闭。远端程序可能继续运行。`,
        action: () => closeSession(id, tabId)
      })
    else void closeSession(id, tabId).catch((e) => report(String(e)))
  }
  function closeTab(tab: Tab) {
    if (tab.kind === 'host' && tab.dirty) {
      setConfirm({
        title: '放弃未保存的修改',
        text: `“${tab.title}”尚未保存，关闭后将丢弃本次表单内容。`,
        action: async () => removeTab(tab.id)
      })
      return
    }
    if (tab.kind !== 'terminal') {
      removeTab(tab.id)
      return
    }
    const perform = async () => {
      for (const id of tab.sessionIds) {
        if (!demo) await window.supilot.request({ type: 'session.close', id })
      }
      if (demo)
        setSample((v) => ({
          ...v,
          sessions: v.sessions.filter((s) => !tab.sessionIds.includes(s.id))
        }))
      removeTab(tab.id)
    }
    if (
      !demo &&
      tab.sessionIds.some((id) => data.sessions.some((s) => s.id === id && activeSession(s)))
    )
      setConfirm({
        title: '关闭终端标签',
        text: `此标签包含 ${tab.sessionIds.length} 个会话，关闭后本地连接将释放，远端程序可能继续运行。`,
        action: perform
      })
    else void perform().catch((e) => report(String(e)))
  }
  function installSession(session: Session, intent: ConnectionIntent) {
    if (intent.split) {
      setTabs((v) =>
        v.map((t) =>
          t.id === intent.split!.tabId && t.kind === 'terminal'
            ? {
                ...t,
                sessionIds: [...t.sessionIds, session.id],
                direction: intent.split!.direction,
                focused: session.id
              }
            : t
        )
      )
      setActive(intent.split.tabId)
    } else
      addTab({
        id: crypto.randomUUID(),
        kind: 'terminal',
        title: `${session.target.name} · ${session.target.username}`,
        sessionIds: [session.id],
        focused: session.id,
        direction: 'horizontal'
      })
  }
  async function completeConnection(challenge: TrustChallenge, intent: ConnectionIntent) {
    if (intent.kind === 'session')
      installSession(
        await window.supilot.request({ type: 'session.open', token: challenge.token }),
        intent
      )
    else {
      const task = await window.supilot.request({
        type: 'task.run',
        token: challenge.token,
        pluginId: 'diagnostics'
      })
      openTasks(task.id)
    }
  }
  async function connect(intent: ConnectionIntent) {
    if (busy) return
    if (demo) {
      if (intent.kind === 'session') {
        const s: Session = {
          id: crypto.randomUUID(),
          target: structuredClone(intent.host),
          state: 'awaiting-auth',
          createdAt: new Date().toISOString(),
          demo: true
        }
        setSample((v) => ({ ...v, sessions: [...v.sessions, s] }))
        installSession(s, intent)
      } else {
        const task = {
          ...structuredClone(demoSnapshot().tasks[0]),
          id: crypto.randomUUID(),
          target: structuredClone(intent.host),
          createdAt: new Date().toISOString(),
          finishedAt: new Date().toISOString()
        }
        setSample((v) => ({ ...v, tasks: [task, ...v.tasks] }))
        openTasks(task.id)
      }
      return
    }
    setBusy(true)
    try {
      const challenge = await window.supilot.request({
        type: 'trust.inspect',
        hostId: intent.host.id,
        target: draftOf(intent.host)
      })
      if (challenge.trusted) await completeConnection(challenge, intent)
      else setTrust({ challenge, intent })
    } catch (e) {
      report(String(e))
    } finally {
      setBusy(false)
    }
  }
  function openHost(host: Host, force = false) {
    setDetailsPeek(false)
    setSelectedHost(host.id)
    const existing = force
      ? undefined
      : tabs.find(
          (t) =>
            t.kind === 'terminal' &&
            t.sessionIds.some((id) =>
              data.sessions.some((s) => s.id === id && s.target.id === host.id && activeSession(s))
            )
        )
    if (existing?.kind === 'terminal') {
      const id = existing.sessionIds.find((id) =>
        data.sessions.some((s) => s.id === id && s.target.id === host.id && activeSession(s))
      )!
      setTabs((v) => v.map((t) => (t.id === existing.id ? { ...existing, focused: id } : t)))
      setActive(existing.id)
    } else void connect({ host, kind: 'session' })
  }
  function split(direction: 'horizontal' | 'vertical') {
    if (current?.kind !== 'terminal' || !currentSession) return
    if (current.sessionIds.length >= 2) {
      setTabs((v) => v.map((t) => (t.id === current.id ? { ...current, direction } : t)))
      return
    }
    void connect({
      host: currentSession.target,
      kind: 'session',
      split: { tabId: current.id, direction }
    })
  }
  function toggleDemo(discardChanges = false) {
    if (!demo && (real.sessions.some(activeSession) || real.tasks.some(activeTask))) {
      report('请先关闭真实终端并等待任务结束，再切换到独立演示模式。')
      return
    }
    if (!discardChanges && tabs.some((tab) => tab.kind === 'host' && tab.dirty)) {
      setConfirm({
        title: '放弃修改并切换模式',
        text: '主机表单尚未保存。切换模式会关闭工作标签并丢弃这些修改。',
        action: async () => toggleDemo(true)
      })
      return
    }
    const next = !demo
    mode.current = next
    setDemo(next)
    setTabs([])
    setActive('')
    setSearch('')
    setSelectedHost('')
    setTrust(undefined)
    setToast(undefined)
    setDetailsPeek(false)
    if (next) {
      const value = demoSnapshot()
      setSample(value)
      setSelectedHost(value.hosts[0].id)
      const id = crypto.randomUUID()
      setTabs([
        {
          id,
          kind: 'terminal',
          title: '东京 / 新加坡 · ops',
          sessionIds: value.sessions.map((s) => s.id),
          focused: value.sessions[0].id,
          direction: 'horizontal'
        }
      ])
      setActive(id)
      ui.set({ tasks: true, details: true, focus: false })
    }
  }
  async function saveHost(draft: HostDraft, tabId: string) {
    let host: Host
    if (demo) {
      host = { ...draft, id: draft.id || crypto.randomUUID(), updatedAt: new Date().toISOString() }
      setSample((v) => ({
        ...v,
        hosts: draft.id ? v.hosts.map((h) => (h.id === host.id ? host : h)) : [...v.hosts, host]
      }))
    } else host = await window.supilot.request({ type: 'host.save', host: draft })
    setSelectedHost(host.id)
    removeTab(tabId)
    report(
      demo ? '演示档案已保存，仅存在内存中。' : '主机档案已保存。双击主机即可连接。',
      'success'
    )
  }
  function deleteHost(host: Host) {
    if (host.local) {
      report('本机档案由应用自动维护，不能删除；可以编辑连接参数。')
      return
    }
    if (host.source === 'ssh-config') {
      report('该档案来自本机 SSH 配置，请从 ~/.ssh/config 移除对应 Host。')
      return
    }
    setConfirm({
      title: '删除主机档案',
      text: `删除“${host.name}”的档案。已有终端与历史任务保留原快照；应用专属主机信任记录保留。`,
      action: async () => {
        if (demo) setSample((v) => ({ ...v, hosts: v.hosts.filter((h) => h.id !== host.id) }))
        else await window.supilot.request({ type: 'host.delete', id: host.id })
        if (selectedHost === host.id) setSelectedHost('')
      }
    })
  }
  function cancelTask(id: string) {
    if (demo)
      setSample((v) => ({
        ...v,
        tasks: v.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                state: 'unknown',
                message: '演示：本地取消已请求，远端完成情况未知。',
                finishedAt: new Date().toISOString()
              }
            : t
        )
      }))
    else void window.supilot.request({ type: 'task.cancel', id }).catch((e) => report(String(e)))
  }
  const filtered = data.hosts.filter((h) =>
    `${h.name} ${h.address} ${h.tags.join(' ')} ${h.group}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  )
  const groups = [...new Set(filtered.map((h) => h.group || '未分组'))]
  const lastTask = target ? data.tasks.find((t) => t.target.id === target.id) : undefined
  const workspaceActions = (
    <div className="toolbar-actions" aria-label="工作区工具">
      {!ui.sidebar && (
        <IconButton
          label="展开主机栏"
          onClick={() => ui.set({ sidebar: true, focus: false })}
        >
          <PanelLeftOpen size={15} />
        </IconButton>
      )}
      {current?.kind === 'terminal' && (
        <>
          <IconButton
            label="左右分屏"
            disabled={busy}
            onClick={() => split('horizontal')}
          >
            <Columns2 size={16} />
          </IconButton>
          <IconButton
            label="上下分屏"
            disabled={busy}
            onClick={() => split('vertical')}
          >
            <Rows2 size={16} />
          </IconButton>
        </>
      )}
      <IconButton
        label={ui.focus ? '退出专注模式' : '专注终端'}
        aria-pressed={ui.focus}
        onClick={() => ui.set({ focus: !ui.focus })}
      >
        <Maximize2 size={15} />
      </IconButton>
      <IconButton
        label={detailsVisible ? '收起详情' : '展开详情'}
        aria-pressed={detailsVisible}
        onClick={() => {
          if (narrow) setDetailsPeek(!detailsPeek)
          else ui.set({ details: !ui.details })
          ui.set({ focus: false })
        }}
      >
        {detailsVisible ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
      </IconButton>
    </div>
  )
  return (
    <TooltipProvider>
      <div className={`app-shell ${ui.focus ? 'focus-mode' : ''} ${demo ? 'demo-mode' : ''}`}>
        <header className="app-header">
          <div className="brand">
            <Compass size={17} />
            <strong>SuPilot</strong>
          </div>
          <div className="flex-1" />
          <button
            className="command-center"
            aria-label="快速打开主机"
            onClick={() => setQuickOpen(true)}
          >
            <Search size={13} />
            <span>搜索并打开主机…</span>
            <span className="command-context">{demo ? '演示工作区' : '本地工作区'}</span>
          </button>
          <div className="flex-1" />
          {demo && (
            <span className="demo-banner">
              <FlaskConical size={14} />
              演示模式 · 不连接真实主机
            </span>
          )}
          {busy && (
            <span className="busy-indicator">
              <LoaderCircle size={13} className="spin" />
              检查连接条件
            </span>
          )}
          <Button variant="ghost" onClick={() => toggleDemo()} disabled={busy}>
            {demo ? '退出演示' : '演示模式'}
          </Button>
        </header>
        {real.engineError && !demo && (
          <div className="engine-error" role="alert">
            {real.engineError}
          </div>
        )}
        <div className="app-body">
          <div className="activity-rail">
            <IconButton
              label="主机导航"
              aria-pressed={ui.sidebar && !ui.focus}
              data-active={ui.sidebar && current?.kind !== 'operation' && current?.kind !== 'tasks'}
              onClick={() => ui.set({ sidebar: !ui.sidebar, focus: false })}
            >
              <Server size={24} />
            </IconButton>
            <IconButton
              label={`系统诊断 · ${selected ? '列表选中主机' : targetContext}：${activityTarget?.name || '尚未选择'}`}
              data-active={current?.kind === 'operation'}
              data-target-id={activityTarget?.id}
              onClick={() => openOperation(activityTarget)}
            >
              <Activity size={24} />
            </IconButton>
            <IconButton
              label="任务记录"
              data-active={current?.kind === 'tasks'}
              onClick={() => openTasks()}
            >
              <ClipboardList size={24} />
            </IconButton>
            <span className="flex-1" />
            <IconButton label="键盘与使用说明" onClick={() => setSettings(true)}>
              <CircleHelp size={23} />
            </IconButton>
            <IconButton label="界面与终端设置" onClick={() => setSettings(true)}>
              <Settings2 size={23} />
            </IconButton>
          </div>
          <PanelGroup direction="horizontal" autoSaveId="supilot-main" className="main-panels">
            {ui.sidebar && !ui.focus && (
              <>
                <Panel id="hosts" order={1} defaultSize={20} minSize={16} maxSize={34}>
                  <aside className="host-sidebar">
                    <div className="sidebar-title">
                      <h2>远程主机</h2>
                      <div className="flex-1" />
                      <IconButton label="添加主机" onClick={() => openEditor()}>
                        <Plus size={17} />
                      </IconButton>
                      <IconButton label="收起主机栏" onClick={() => ui.set({ sidebar: false })}>
                        <PanelLeftClose size={16} />
                      </IconButton>
                    </div>
                    <div className="search-box">
                      <Search size={15} />
                      <input
                        ref={searchInput}
                        aria-label="搜索主机"
                        placeholder="筛选主机…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search && (
                        <IconButton label="清除搜索" onClick={() => setSearch('')}>
                          <X size={13} />
                        </IconButton>
                      )}
                    </div>
                    <div className="host-list">
                      {tabs.some((tab) => tab.kind === 'terminal') && (
                        <section className="open-sessions" aria-label="打开的会话">
                          <h3 className="explorer-heading">打开的会话</h3>
                          {tabs
                            .filter((tab) => tab.kind === 'terminal')
                            .map((tab) => (
                              <button
                                key={tab.id}
                                className={`session-row ${active === tab.id ? 'selected' : ''}`}
                                aria-pressed={active === tab.id}
                                onClick={() => setActive(tab.id)}
                              >
                                <TerminalSquare size={15} />
                                <span className="truncate">{tab.title}</span>
                                <span className="count">
                                  {tab.kind === 'terminal' ? tab.sessionIds.length : ''}
                                </span>
                              </button>
                            ))}
                        </section>
                      )}
                      <h3 className="explorer-heading">
                        SSH 主机
                        <span className="count">
                          {search.trim()
                            ? `${filtered.length} / ${data.hosts.length}`
                            : data.hosts.length}
                        </span>
                      </h3>
                      {groups.map((group) => (
                        <section key={group}>
                          <button
                            className="group-heading"
                            onClick={() =>
                              setCollapsed((v) =>
                                v.includes(group) ? v.filter((x) => x !== group) : [...v, group]
                              )
                            }
                            aria-expanded={!collapsed.includes(group)}
                          >
                            {collapsed.includes(group) ? (
                              <ChevronRight size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )}
                            <Folder size={13} />
                            <span className="truncate">{group}</span>
                            <span>
                              {filtered.filter((h) => (h.group || '未分组') === group).length}
                            </span>
                          </button>
                          {!collapsed.includes(group) &&
                            filtered
                              .filter((h) => (h.group || '未分组') === group)
                              .map((h) => {
                                const live = data.sessions.some(
                                  (s) => s.target.id === h.id && activeSession(s)
                                )
                                return (
                                  <button
                                    key={h.id}
                                    className={`host-row ${selectedHost === h.id ? 'selected' : ''}`}
                                    aria-pressed={selectedHost === h.id}
                                    onClick={() => setSelectedHost(h.id)}
                                    onDoubleClick={() => openHost(h)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') openHost(h)
                                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                        e.preventDefault()
                                        const rows = Array.from(
                                          e.currentTarget
                                            .closest('.host-list')!
                                            .querySelectorAll<HTMLButtonElement>('.host-row')
                                        )
                                        rows[
                                          Math.max(
                                            0,
                                            Math.min(
                                              rows.length - 1,
                                              rows.indexOf(e.currentTarget) +
                                                (e.key === 'ArrowDown' ? 1 : -1)
                                            )
                                          )
                                        ]?.focus()
                                      }
                                    }}
                                    title={`${h.name}\n${endpoint(h)}\n${h.tags.join(' · ')}`}
                                  >
                                    <span className={`host-glyph ${live ? 'live' : ''}`}>
                                      <Server size={16} />
                                    </span>
                                    <span className="host-copy">
                                      <strong>{h.name}</strong>
                                      {search.trim() && (
                                        <small className="search-match">
                                          {h.address} · {h.tags.join(', ')}
                                        </small>
                                      )}
                                    </span>
                                    {(h.local || h.source === 'ssh-config' || live) && (
                                      <span
                                        className={`host-state ${h.local ? 'local' : h.source === 'ssh-config' ? 'config' : ''}`}
                                      >
                                        {h.local
                                          ? '本机'
                                          : h.source === 'ssh-config'
                                            ? '配置'
                                            : demo
                                              ? '模拟'
                                              : '会话'}
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                        </section>
                      ))}
                      {!filtered.length && (
                        <div className="sidebar-empty">
                          <Server size={24} />
                          <p>{search ? '没有匹配的主机' : '还没有主机'}</p>
                          <small>
                            {search ? '尝试地址或标签关键词' : '添加主机，开始你的工作区'}
                          </small>
                          {!search && (
                            <Button onClick={() => openEditor()}>
                              <Plus size={14} />
                              添加主机
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="host-selection">
                      {selected ? (
                        <>
                          <div>
                            <span>列表选中主机</span>
                            <strong className="truncate" title={selected.name}>{selected.name}</strong>
                            <span className="truncate" title={endpoint(selected)}>
                              {endpoint(selected)}
                            </span>
                          </div>
                          <div className="selection-actions">
                            <Button
                              aria-label="新建会话"
                              title="新建会话"
                              disabled={busy}
                              onClick={() => openHost(selected, true)}
                            >
                              <Plus size={13} />
                              <span className="selection-action-label">新建</span>
                            </Button>
                            <IconButton label="编辑选中主机" onClick={() => openEditor(selected)}>
                              <Edit3 size={15} />
                            </IconButton>
                            <IconButton
                              label={
                                selected.local || selected.source === 'ssh-config'
                                  ? '本机 SSH 配置档案不可删除'
                                  : '删除选中主机'
                              }
                              disabled={selected.local || selected.source === 'ssh-config'}
                              onClick={() => deleteHost(selected)}
                            >
                              <Trash2 size={15} />
                            </IconButton>
                          </div>
                        </>
                      ) : (
                        <span className="muted small">单击选择 · 双击连接</span>
                      )}
                    </div>
                    <div className="sidebar-bottom">
                      <ShieldCheck size={13} />
                      {demo ? '独立演示数据源' : '主机数据保存在本机'}
                    </div>
                  </aside>
                </Panel>
                <PanelResizeHandle className="resize-handle" />
              </>
            )}
            <Panel id="workspace" order={2} minSize={40}>
              <main className="workspace">
                <div className={`tab-bar ${current?.kind === 'terminal' ? 'terminal-tab-bar' : ''}`}>
                  <div className="tabs" role="tablist" aria-label="工作标签">
                    {!tabs.length && (
                      <span className="welcome-tab">
                        <Compass size={14} />
                        欢迎使用
                      </span>
                    )}
                    {tabs.map((tab) => (
                      <div className={`work-tab ${active === tab.id ? 'active' : ''}`} key={tab.id}>
                        <button
                          role="tab"
                          aria-selected={active === tab.id}
                          id={`tab-${tab.id}`}
                          aria-controls={`content-${tab.id}`}
                          tabIndex={active === tab.id ? 0 : -1}
                          title={
                            tab.kind === 'host' && tab.dirty ? `${tab.title} · 未保存` : tab.title
                          }
                          onKeyDown={(e) => {
                            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
                            e.preventDefault()
                            const i = tabs.indexOf(tab)
                            const next =
                              tabs[
                                e.key === 'Home'
                                  ? 0
                                  : e.key === 'End'
                                    ? tabs.length - 1
                                    : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
                                      tabs.length
                              ]
                            setActive(next.id)
                            requestAnimationFrame(() =>
                              document.getElementById(`tab-${next.id}`)?.focus()
                            )
                          }}
                          onClick={() => setActive(tab.id)}
                        >
                          {tab.kind === 'terminal' ? (
                            <TerminalSquare size={14} />
                          ) : tab.kind === 'tasks' ? (
                            <ClipboardList size={14} />
                          ) : tab.kind === 'host' ? (
                            <Server size={14} />
                          ) : (
                            <Activity size={14} />
                          )}
                          <span>{tab.title}</span>
                          {tab.kind === 'host' && tab.dirty && (
                            <span className="dirty-dot" aria-label="未保存" />
                          )}
                        </button>
                        <IconButton label={`关闭标签 ${tab.title}`} onClick={() => closeTab(tab)}>
                          <X size={12} />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                  <div className="tab-actions">
                    {current?.kind === 'terminal' && workspaceActions}
                    <IconButton
                      label="新建选中主机的会话"
                      disabled={!selected || busy}
                      onClick={() => selected && openHost(selected, true)}
                    >
                      <Plus size={16} />
                    </IconButton>
                  </div>
                </div>
                {current?.kind !== 'terminal' && (
                  <div className="workspace-toolbar">
                    <div className="breadcrumb">
                      <TerminalSquare size={13} />
                      <span>
                        {current?.kind === 'operation'
                          ? '操作中心'
                          : current?.kind === 'host'
                            ? '主机管理'
                            : current?.kind === 'tasks'
                              ? '执行记录'
                              : '开始使用'}
                      </span>
                      <ChevronRight size={12} />
                      <strong className="truncate">{target?.name || 'SuPilot'}</strong>
                    </div>
                    {workspaceActions}
                  </div>
                )}
                <div className="work-content">
                  {tabs.map((tab) => (
                    <div
                      className="tab-content"
                      key={tab.id}
                      id={`content-${tab.id}`}
                      role="tabpanel"
                      aria-labelledby={`tab-${tab.id}`}
                      hidden={active !== tab.id}
                    >
                      {tab.kind === 'terminal' ? (
                        <PanelGroup direction={tab.direction}>
                          {tab.sessionIds
                            .map((id, i) => {
                              const s = data.sessions.find((x) => x.id === id)
                              return (
                                s && (
                                  <Panel key={id} defaultSize={50} minSize={20}>
                                    <TerminalPane
                                      session={s}
                                      index={i}
                                      visible={active === tab.id}
                                      focused={tab.focused === id}
                                      onFocus={() =>
                                        setTabs((v) =>
                                          v.map((t) =>
                                            t.id === tab.id ? { ...tab, focused: id } : t
                                          )
                                        )
                                      }
                                      onClose={() => requestCloseSession(id, tab.id)}
                                      report={report}
                                    />
                                  </Panel>
                                )
                              )
                            })
                            .flatMap((node, i) =>
                              i
                                ? [
                                    <PanelResizeHandle
                                      key={`handle-${i}`}
                                      className={`resize-handle terminal-resize ${tab.direction}`}
                                    />,
                                    node
                                  ]
                                : [node]
                            )}
                        </PanelGroup>
                      ) : tab.kind === 'host' ? (
                        <HostForm
                          host={tab.host}
                          demo={demo}
                          onSave={(h) => saveHost(h, tab.id)}
                          onCancel={() => closeTab(tab)}
                          onDirtyChange={(dirty) =>
                            setTabs((items) =>
                              items.some(
                                (t) => t.id === tab.id && t.kind === 'host' && t.dirty !== dirty
                              )
                                ? items.map((t) => (t.id === tab.id ? { ...t, dirty } : t))
                                : items
                            )
                          }
                        />
                      ) : tab.kind === 'operation' ? (
                        <Operations
                          host={tab.host}
                          plugin={tab.plugin}
                          demo={demo}
                          busy={busy}
                          onRun={() => tab.host && void connect({ host: tab.host, kind: 'task' })}
                        />
                      ) : (
                        <TasksPage
                          key={`${tab.id}-${tab.selectionVersion || 0}`}
                          tasks={data.tasks}
                          initialId={tab.taskId}
                          onCancel={cancelTask}
                          onSelect={(id) =>
                            setTabs((v) =>
                              v.map((t) => (t.id === tab.id ? { ...tab, taskId: id } : t))
                            )
                          }
                        />
                      )}
                    </div>
                  ))}
                  {!tabs.length && (
                    <div className="welcome">
                      <div className="welcome-inner">
                        <div className="welcome-eyebrow">
                          <Compass size={14} aria-hidden="true" />
                          <span>{demo ? '演示工作区' : '本地工作区'}</span>
                        </div>
                        <div className="welcome-heading">
                          <div>
                            <h1>开始使用 SuPilot</h1>
                            <p className="welcome-subtitle">连接主机、打开终端，并在同一个工作区查看只读诊断结果。</p>
                          </div>
                        </div>
                        {loadState === 'loading' && !demo ? (
                          <div className="welcome-state welcome-state-loading" role="status">
                            <LoaderCircle className="spin" size={16} />
                            <span>正在加载本机工作区…</span>
                          </div>
                        ) : loadState === 'error' && !demo ? (
                          <div className="welcome-state welcome-state-error" role="alert">
                            <AlertCircle size={16} />
                            <div>
                              <strong>本机工作区暂时无法读取</strong>
                              <p>{snapshotError}</p>
                              <small>当前没有足够信息判断主机数量或 OpenSSH 状态；可以填写档案或查看演示工作区。</small>
                              <div className="welcome-actions">
                                <Button variant="primary" onClick={() => openEditor()}>
                                  <Plus size={15} />
                                  添加主机
                                </Button>
                                <Button onClick={() => toggleDemo()}>
                                  <FlaskConical size={15} />
                                  探索演示工作区
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : loadState === 'ready' && real.engineError && !demo ? (
                          <div className="welcome-state welcome-state-error" role="alert">
                            <AlertCircle size={16} />
                            <div>
                              <strong>本机工作区加载失败</strong>
                              <p>{real.engineError}</p>
                              <small>仍可填写主机档案或进入演示工作区；不会把未加载的数据显示为零主机。</small>
                              <div className="welcome-actions">
                                <Button variant="primary" onClick={() => openEditor()}><Plus size={15} />添加主机</Button>
                                <Button onClick={() => toggleDemo()}><FlaskConical size={15} />探索演示工作区</Button>
                              </div>
                            </div>
                          </div>
                        ) : loadState === 'ready' && !demo && !real.sshAvailable ? (
                          <div className="welcome-state welcome-state-error" role="alert">
                            <AlertCircle size={16} />
                            <div>
                              <strong>系统 OpenSSH 不可用</strong>
                              <p>可继续填写主机档案或查看演示工作区；连接前请在 Windows 可选功能中安装 OpenSSH 客户端。</p>
                            </div>
                          </div>
                        ) : null}
                        {loadState === 'ready' && !real.engineError && real.hosts.length > 0 && !demo ? (
                          <section className="welcome-entry welcome-entry-existing" aria-labelledby="welcome-existing-title">
                            <div>
                              <span className="welcome-kicker">已有主机</span>
                              <h2 id="welcome-existing-title">继续处理已有主机</h2>
                              <p>{welcomeHost ? `当前选中：${welcomeHost.name}` : '从主机列表或快速打开中选择目标。'}</p>
                            </div>
                            <div className="welcome-actions">
                              <Button variant="primary" onClick={() => setQuickOpen(true)}>
                                <Search size={15} />
                                快速打开主机
                                <ArrowRight size={15} />
                              </Button>
                              <Button onClick={() => openEditor()}>
                                <Plus size={15} />
                                添加主机
                              </Button>
                            </div>
                          </section>
                        ) : loadState === 'ready' && !real.engineError && !demo ? (
                          <section className="welcome-entry welcome-entry-first" aria-labelledby="welcome-first-title">
                            <div>
                              <span className="welcome-kicker">首次使用</span>
                              <h2 id="welcome-first-title">先添加一台主机</h2>
                              <p>填写名称、地址、连接端口、用户名和认证方式即可保存档案。</p>
                            </div>
                            <div className="welcome-actions">
                              <Button variant="primary" onClick={() => openEditor()}>
                                <Plus size={15} />
                                添加主机
                                <ArrowRight size={15} />
                              </Button>
                              <Button onClick={() => toggleDemo()}>
                                <FlaskConical size={15} />
                                探索演示工作区
                              </Button>
                            </div>
                          </section>
                        ) : null}
                        <section className="welcome-guide" aria-labelledby="welcome-guide-title">
                          <div className="welcome-section-heading">
                            <h2 id="welcome-guide-title">开始后</h2>
                            <span>三步了解工作区</span>
                          </div>
                          <div className="welcome-steps">
                            <div className="welcome-step"><strong>添加或选择主机</strong><small>档案会固定连接信息和认证引用。</small></div>
                            <div className="welcome-step"><strong>打开终端</strong><small>核对指纹后建立真实 SSH 会话。</small></div>
                            <div className="welcome-step"><strong>运行只读诊断</strong><small>结果保存到任务记录，状态按实际回报展示。</small></div>
                          </div>
                        </section>
                        <div className="welcome-footer-note">
                          <ShieldCheck size={14} />
                          <span>主机数据保存在本机；启动时只读发现 SSH 配置，不修改系统 SSH 配置或用户私钥。</span>
                          <button className="welcome-settings" onClick={() => setSettings(true)}>
                            <Settings2 size={13} /> 设置
                          </button>
                          <span className="welcome-shortcut"><Keyboard size={13} /> Ctrl+K 快速打开</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {!ui.focus && (
                  <section className={`task-drawer ${ui.tasks ? 'expanded' : ''}`}>
                    <header>
                      <button onClick={() => ui.set({ tasks: !ui.tasks })} aria-expanded={ui.tasks}>
                        <ClipboardList size={14} />
                        <strong>任务</strong>
                        <span>{running ? `${running} 运行中` : '无运行中任务'}</span>
                        {attention > 0 && (
                          <span className="attention-count">{attention} 需要关注</span>
                        )}
                        {ui.tasks ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </button>
                      <Button variant="ghost" onClick={() => openTasks()}>
                        全部记录
                        <ArrowRight size={13} />
                      </Button>
                    </header>
                    {ui.tasks && (
                      <div className="drawer-list">
                        <div className="drawer-columns">
                          <span>操作 / 主机</span>
                          <span>状态</span>
                          <span>开始时间</span>
                          <span>范围</span>
                        </div>
                        {data.tasks.slice(0, 8).map((task) => (
                          <button
                            key={task.id}
                            className="drawer-task"
                            onClick={() => openTasks(task.id)}
                          >
                            <span>
                              <Activity size={13} />
                              <strong>{task.title}</strong>
                              <span className="truncate">{task.target.name}</span>
                            </span>
                            <Status state={task.state} />
                            <time>{time(task.createdAt)}</time>
                            <span className="muted">
                              {task.demo ? '模拟 · 只读' : '单机 · 只读'}
                            </span>
                          </button>
                        ))}
                        {!data.tasks.length && (
                          <p className="drawer-empty">
                            还没有任务。打开主机的“系统诊断”，检查结果会留存在这里。
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                )}
              </main>
            </Panel>
          </PanelGroup>
          {detailsVisible && (
            <SidePanel floating={narrow} title="主机详情" onClose={() => setDetailsPeek(false)}>
              <header>
                <h2>主机详情</h2>
                <IconButton
                  label="关闭详情栏"
                  onClick={() => {
                    setDetailsPeek(false)
                    if (!narrow) ui.set({ details: false })
                  }}
                >
                  <X size={15} />
                </IconButton>
              </header>
              {target ? (
                <>
                  <h3 className="explorer-heading">{targetContext}</h3>
                  <div className="detail-identity">
                    <h3>{target.name}</h3>
                    <code>{endpoint(target)}</code>
                    <span className="detail-state">
                      {currentSession ? (
                        currentSession.demo ? (
                          '演示窗格 · 未建立连接'
                        ) : (
                          <Status state={currentSession.state} />
                        )
                      ) : target.source === 'ssh-config' ? (
                        '来自本机 SSH 配置'
                      ) : target.local ? (
                        '本机档案 · 不会自动连接'
                      ) : (
                        '档案信息 · 非实时在线状态'
                      )}
                    </span>
                  </div>
                  <dl className="detail-fields">
                    <div>
                      <dt>用户</dt>
                      <dd>{target.username}</dd>
                    </div>
                    <div>
                      <dt>公网端口</dt>
                      <dd>{target.port}</dd>
                    </div>
                    <div>
                      <dt>sshd 端口</dt>
                      <dd>{target.sshdPort ?? '未记录'}</dd>
                    </div>
                    <div>
                      <dt>认证</dt>
                      <dd>{target.auth === 'agent' ? 'SSH Agent' : '私钥引用'}</dd>
                    </div>
                    <div>
                      <dt>分组</dt>
                      <dd>{target.group || '未分组'}</dd>
                    </div>
                  </dl>
                  <div className="detail-tags">
                    {target.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="detail-section">
                    <h4>最近检查</h4>
                    {lastTask ? (
                      <>
                        <Status state={lastTask.state} />
                        <button
                          className="detail-report-link"
                          onClick={() => openTasks(lastTask.id)}
                        >
                          {time(lastTask.finishedAt || lastTask.createdAt)}
                          <ChevronRight size={14} />
                        </button>
                        <small>
                          {lastTask.demo
                            ? '合成数据，仅用于界面演示'
                            : '历史检查不代表当前服务状态'}
                        </small>
                      </>
                    ) : (
                      <p>
                        尚未检查<small>运行诊断后显示检查时间</small>
                      </p>
                    )}
                  </div>
                  <div className="detail-section">
                    <h4>快捷操作</h4>
                    <button
                      className="detail-action"
                      disabled={busy}
                      onClick={() => openHost(target, true)}
                    >
                      <TerminalSquare size={16} />
                      新建 SSH 会话
                      <Plus size={13} />
                    </button>
                    <button
                      className="detail-action"
                      aria-label={`系统诊断 · ${targetContext}：${target.name}`}
                      title={`在“${target.name}”上运行系统诊断`}
                      data-target-id={target.id}
                      onClick={() => openOperation(target)}
                    >
                      <Activity size={16} />
                      系统诊断
                      <ChevronRight size={13} />
                    </button>
                    <button
                      className="detail-action"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(target.address)
                          .then(() => report('主机地址已复制。', 'success'))
                          .catch(() => report('复制失败。'))
                      }
                    >
                      <Copy size={15} />
                      复制地址
                    </button>
                  </div>
                  <details className="detail-section detail-fold">
                    <summary>
                      扩展能力 <span>规划中</span>
                    </summary>
                    <button
                      className="detail-action muted"
                      onClick={() => openOperation(target, 'surelay')}
                    >
                      <Layers3 size={15} />
                      SuRelay
                      <ChevronRight size={13} />
                    </button>
                    <button
                      className="detail-action muted"
                      onClick={() => openOperation(target, 'access')}
                    >
                      <ShieldCheck size={15} />
                      Access
                      <ChevronRight size={13} />
                    </button>
                  </details>
                  {target.notes && (
                    <details className="detail-section detail-fold">
                      <summary>备注</summary>
                      <p>{target.notes}</p>
                    </details>
                  )}
                  <div className="detail-footnote">
                    <Info size={13} />
                    {current ? '详情跟随当前工作标签的固定目标' : '详情显示列表选中的主机档案'}
                  </div>
                </>
              ) : (
                <div className="detail-empty">
                  <Server size={29} />
                  <p>选择你的工作目标</p>
                  <small>打开终端或操作标签后，这里会显示对应主机与连接信息。</small>
                </div>
              )}
            </SidePanel>
          )}
        </div>
        <footer className="status-bar">
          <span className="status-remote">
            <RadioTower size={13} />
            {demo
              ? 'DEMO · 合成数据'
              : real.engineError
                ? 'Engine 已停止'
                : loading
                  ? 'Engine 启动中'
                  : '本机工作区'}
          </span>
          <span>{data.hosts.length} 台主机</span>
          <span>{demo ? `${activeCount} 个模拟窗格` : `${activeCount} 个活跃会话`}</span>
          <div className="flex-1" />
          <span className="status-hint">
            <Keyboard size={12} /> Ctrl+Shift+C / V 复制粘贴
          </span>
          <button onClick={() => ui.set({ focus: !ui.focus })}>
            {ui.focus ? '退出专注' : '专注模式'}
          </button>
          <span>UTF-8</span>
        </footer>
        {toast && (
          <div
            className={`toast toast-${toast.kind}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            {toast.kind === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <div>
              <strong>{toast.kind === 'error' ? '操作未完成' : '已完成'}</strong>
              <span>{toast.message}</span>
            </div>
            <IconButton label="关闭提示" onClick={() => setToast(undefined)}>
              <X size={15} />
            </IconButton>
          </div>
        )}
        {quickOpen && (
          <QuickOpen hosts={data.hosts} onClose={() => setQuickOpen(false)} onOpen={openHost} />
        )}
        <Dialog
          open={!!trust}
          onClose={() => setTrust(undefined)}
          title="核对服务器身份"
          description="这是首次连接。请从服务器控制台或可信管理员处独立核对以下指纹；扫描得到的指纹本身不能证明服务器身份。"
        >
          {trust && (
            <>
              <div className="trust-target">
                <strong>{trust.challenge.target.name}</strong>
                <code>{endpoint(trust.challenge.target)}</code>
              </div>
              <div className="fingerprints">
                {trust.challenge.keys.map((k) => (
                  <div key={k.algorithm}>
                    <span>{k.algorithm}</span>
                    <code>{k.fingerprint}</code>
                  </div>
                ))}
              </div>
              <p className="small">
                确认后仅写入 SuPilot 专属 known_hosts。不会修改系统 SSH
                文件；已知指纹变化时将阻止连接。
              </p>
              <div className="form-actions">
                <Button onClick={() => setTrust(undefined)}>取消连接</Button>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    const value = trust
                    try {
                      const challenge = await window.supilot.request({
                        type: 'trust.accept',
                        token: value.challenge.token
                      })
                      setTrust(undefined)
                      await completeConnection(challenge, value.intent)
                    } catch (e) {
                      report(String(e))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  已独立核对，信任并继续
                </Button>
              </div>
            </>
          )}
        </Dialog>
        <Dialog
          open={!!confirm}
          onClose={() => setConfirm(undefined)}
          title={confirm?.title || '确认操作'}
          description={confirm?.text || ''}
        >
          <div className="form-actions">
            <Button onClick={() => setConfirm(undefined)}>返回</Button>
            <Button
              variant="danger"
              onClick={() => {
                const action = confirm?.action
                setConfirm(undefined)
                void action?.().catch((e) => report(String(e)))
              }}
            >
              确认{confirm?.title}
            </Button>
          </div>
        </Dialog>
        <Dialog
          open={settings}
          onClose={() => setSettings(false)}
          title="界面与终端"
          description="应用字号与终端字号分别设置，ANSI 配色不会改变应用主题。"
        >
          <div className="settings-fields">
            <label className="field">
              <span>界面字号 · {ui.uiSize}px</span>
              <input
                aria-label="界面字号"
                type="range"
                min={12}
                max={17}
                value={ui.uiSize}
                onChange={(e) => ui.set({ uiSize: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>终端字号 · {ui.terminalSize}px</span>
              <input
                aria-label="终端字号"
                type="range"
                min={11}
                max={22}
                value={ui.terminalSize}
                onChange={(e) => ui.set({ terminalSize: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>终端 ANSI 配色</span>
              <select
                value={ui.ansi}
                onChange={(e) => ui.set({ ansi: e.target.value as typeof ui.ansi })}
              >
                <option value="dark-plus">Dark+ · VS Code 经典深色</option>
                <option value="graphite">Graphite · 柔和冷色</option>
                <option value="classic">Classic · 经典配色</option>
              </select>
            </label>
          </div>
          <div className="inline-note">
            <Keyboard size={17} />
            <span>
              Ctrl+C / Ctrl+D / Ctrl+R 直接交给 Shell。使用 Ctrl+Shift+C / V 复制粘贴。主机行 Enter
              或双击打开会话；分隔线可用方向键调整。
            </span>
          </div>
          <p className="small">{data.dataPath}</p>
          <div className="form-actions">
            <Button onClick={() => setSettings(false)}>完成</Button>
          </div>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
