import { useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Columns2,
  Compass,
  Edit3,
  FlaskConical,
  Keyboard,
  LoaderCircle,
  Menu,
  Plus,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Rows2,
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
import { Button, Dialog, IconButton, Status, TooltipProvider } from '@supilot/ui'
import { useUI } from './state'
import { demoSnapshot } from './demo'
import { TerminalPane } from '../features/terminal/Terminal'
import { HostForm, draftOf } from '../features/hosts/HostForm'
import { Operations } from '../features/operations/Operations'
import { TasksPage } from '../features/tasks/Tasks'
import { QuickOpen } from './QuickOpen'
import { endpoint } from './format'
import { snapshotLoadState } from './snapshotState'
import '@xterm/xterm/css/xterm.css'

declare global { interface Window { supilot: DesktopAPI } }

type Page = 'hosts' | 'terminal' | 'tools' | 'diagnostic' | 'tasks'
type SourcePage = 'hosts' | 'terminal'
type TerminalGroup = {
  id: string
  sessionIds: string[]
  focused: string
  direction: 'horizontal' | 'vertical'
}
type ConnectionIntent = {
  host: Host
  kind: 'session' | 'task'
  split?: { groupId: string; direction: 'horizontal' | 'vertical' }
}

const empty: Snapshot = {
  hosts: [], sessions: [], tasks: [], plugins: [], sshAvailable: false, dataPath: ''
}

export function App() {
  const ui = useUI()
  const [real, setReal] = useState<Snapshot>(empty)
  const [sample, setSample] = useState<Snapshot>(demoSnapshot)
  const [demo, setDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [snapshotReady, setSnapshotReady] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string>()
  const [page, setPage] = useState<Page>('hosts')
  const [groups, setGroups] = useState<TerminalGroup[]>([])
  const [selectedHost, setSelectedHost] = useState('')
  const [search, setSearch] = useState('')
  const [operationHost, setOperationHost] = useState<Host>()
  const [taskId, setTaskId] = useState<string>()
  const [editing, setEditing] = useState<{ host?: Host; source: SourcePage }>()
  const [editDirty, setEditDirty] = useState(false)
  const [settings, setSettings] = useState(false)
  const [tasksOverlay, setTasksOverlay] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [trust, setTrust] = useState<{ challenge: TrustChallenge; intent: ConnectionIntent }>()
  const [confirm, setConfirm] = useState<{
    title: string
    text: string
    action: () => Promise<void>
  }>()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; kind: 'error' | 'success' }>()
  const searchInput = useRef<HTMLInputElement>(null)
  const data = demo ? sample : real
  const activeGroup = groups[0]
  const activeSessionValue = data.sessions.find((s) => s.id === activeGroup?.focused)
  const selectedHostValue = data.hosts.find((host) => host.id === selectedHost)
  const running = data.tasks.filter(activeTask).length
  const attention = data.tasks.filter((t) => ['failed', 'unknown', 'interrupted'].includes(t.state)).length
  const loadState = snapshotLoadState(loading, snapshotReady, snapshotError)
  const filtered = data.hosts.filter((h) =>
    `${h.name} ${h.address} ${h.tags.join(' ')} ${h.group}`.toLowerCase().includes(search.trim().toLowerCase())
  )
  const report = (message: string, kind: 'error' | 'success' = 'error') =>
    setToast({ message: message.replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, ''), kind })

  useEffect(() => {
    let mounted = true
    let subscribed = false
    const accept = (snapshot: Snapshot) => {
      if (!mounted) return
      setReal(snapshot)
      setSnapshotReady(true)
      setSnapshotError(undefined)
      setLoading(false)
      if (!selectedHost && snapshot.hosts.length) {
        setSelectedHost(
          snapshot.hosts.find((h) => h.source === 'ssh-config')?.id ||
            snapshot.hosts.find((h) => h.local)?.id || snapshot.hosts[0].id
        )
      }
    }
    const off = window.supilot.subscribe((snapshot) => { subscribed = true; accept(snapshot) })
    void window.supilot.request({ type: 'snapshot' })
      .then((snapshot) => { if (!subscribed) accept(snapshot) })
      .catch((error) => {
        if (mounted && !subscribed) { setSnapshotError(String(error)); setLoading(false) }
      })
    return () => { mounted = false; off() }
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font-size', `${ui.uiSize}px`)
  }, [ui.uiSize])
  useEffect(() => {
    if (toast?.kind !== 'success') return
    const timer = setTimeout(() => setToast(undefined), 4500)
    return () => clearTimeout(timer)
  }, [toast])

  function navigate(next: Page) {
    if (editing && editDirty && next !== page) {
      setConfirm({
        title: '放弃未保存的修改',
        text: '当前主机档案尚未保存，离开页面会丢弃这些修改。',
        action: async () => { setEditing(undefined); setEditDirty(false); setPage(next) }
      })
      return
    }
    setPage(next)
  }
  function openEditor(host?: Host, source: SourcePage = page === 'terminal' ? 'terminal' : 'hosts') {
    setEditing({ host: host && structuredClone(host), source })
    setEditDirty(false)
    setPage('hosts')
  }
  function closeEditor() {
    const source = editing?.source || 'hosts'
    if (editDirty) {
      setConfirm({
        title: '放弃未保存的修改',
        text: '当前主机档案尚未保存，返回后会丢弃这些修改。',
        action: async () => { setEditing(undefined); setEditDirty(false); setPage(source) }
      })
    } else { setEditing(undefined); setPage(source) }
  }
  function openTasks(id?: string) { setTaskId(id || data.tasks[0]?.id); setTasksOverlay(false); navigate('tasks') }
  function openOperation(host?: Host) { setOperationHost(host && structuredClone(host)); navigate('tools') }
  function installSession(session: Session, intent: ConnectionIntent) {
    if (intent.split) {
      setGroups((value) => value.map((group) => group.id === intent.split!.groupId
        ? { ...group, sessionIds: [...group.sessionIds, session.id], focused: session.id, direction: intent.split!.direction }
        : group))
    } else {
      setGroups((value) => [...value, {
        id: crypto.randomUUID(), sessionIds: [session.id], focused: session.id, direction: 'horizontal'
      }])
    }
    setPage('terminal')
  }
  async function completeConnection(challenge: TrustChallenge, intent: ConnectionIntent) {
    if (intent.kind === 'session') {
      installSession(await window.supilot.request({ type: 'session.open', token: challenge.token }), intent)
    } else {
      const task = await window.supilot.request({ type: 'task.run', token: challenge.token, pluginId: 'diagnostics' })
      setTaskId(task.id); setPage('tasks')
    }
  }
  async function connect(intent: ConnectionIntent) {
    if (busy) return
    if (demo) {
      if (intent.kind === 'session') {
        const session: Session = {
          id: crypto.randomUUID(), target: structuredClone(intent.host), state: 'awaiting-auth',
          createdAt: new Date().toISOString(), demo: true, message: '模拟终端 · 无网络连接'
        }
        setSample((value) => ({ ...value, sessions: [...value.sessions, session] }))
        installSession(session, intent)
      } else {
        const task = {
          ...structuredClone(demoSnapshot().tasks[0]), id: crypto.randomUUID(), target: structuredClone(intent.host),
          createdAt: new Date().toISOString(), finishedAt: new Date().toISOString()
        }
        setSample((value) => ({ ...value, tasks: [task, ...value.tasks] }))
        setTaskId(task.id); setPage('tasks')
      }
      return
    }
    setBusy(true)
    try {
      const challenge = await window.supilot.request({
        type: 'trust.inspect', hostId: intent.host.id, target: draftOf(intent.host)
      })
      if (challenge.trusted) await completeConnection(challenge, intent)
      else setTrust({ challenge, intent })
    } catch (error) { report(String(error)) } finally { setBusy(false) }
  }
  function openHost(host: Host, force = false) {
    setSelectedHost(host.id)
    const existing = !force && groups.find((group) => group.sessionIds.some((id) =>
      data.sessions.some((session) => session.id === id && session.target.id === host.id && activeSession(session))))
    if (existing) {
      const id = existing.sessionIds.find((sid) => data.sessions.some((s) =>
        s.id === sid && s.target.id === host.id && activeSession(s)))!
      setGroups((value) => value.map((group) => group.id === existing.id ? { ...group, focused: id } : group))
      setPage('terminal')
    } else void connect({ host, kind: 'session' })
  }
  function split(direction: 'horizontal' | 'vertical') {
    if (!activeGroup || !activeSessionValue) return
    if (activeGroup.sessionIds.length >= 2) setGroups((value) => value.map((group) =>
      group.id === activeGroup.id ? { ...group, direction } : group))
    else void connect({ host: activeSessionValue.target, kind: 'session', split: { groupId: activeGroup.id, direction } })
  }
  async function saveHost(draft: HostDraft) {
    const host = demo
      ? { ...draft, id: draft.id || crypto.randomUUID(), updatedAt: new Date().toISOString() }
      : await window.supilot.request({ type: 'host.save', host: draft })
    if (demo) setSample((value) => ({ ...value, hosts: draft.id
      ? value.hosts.map((item) => item.id === host.id ? host : item) : [...value.hosts, host] }))
    setSelectedHost(host.id)
    const source = editing?.source || 'hosts'
    setEditing(undefined); setEditDirty(false); setPage(source)
    report(demo ? '演示档案已保存，仅存在内存中。' : '主机档案已保存。', 'success')
  }
  function deleteHost(host: Host) {
    if (host.local) return report('本机档案由应用自动维护，不能删除；可以编辑连接参数。')
    if (host.source === 'ssh-config') return report('该档案来自本机 SSH 配置，请从 ~/.ssh/config 移除对应 Host。')
    setConfirm({
      title: '删除主机档案',
      text: `删除“${host.name}”的档案。已有终端与历史任务保留原快照；应用专属主机信任记录保留。`,
      action: async () => {
        if (demo) setSample((value) => ({ ...value, hosts: value.hosts.filter((item) => item.id !== host.id) }))
        else await window.supilot.request({ type: 'host.delete', id: host.id })
        if (selectedHost === host.id) setSelectedHost('')
      }
    })
  }
  async function closeSession(id: string, groupId: string) {
    if (demo) setSample((value) => ({ ...value, sessions: value.sessions.filter((s) => s.id !== id) }))
    else await window.supilot.request({ type: 'session.close', id })
    setGroups((value) => value.map((group) => group.id === groupId
      ? { ...group, sessionIds: group.sessionIds.filter((sid) => sid !== id), focused: group.sessionIds.find((sid) => sid !== id) || '' }
      : group).filter((group) => group.sessionIds.length))
  }
  function requestCloseSession(id: string, groupId: string) {
    const session = data.sessions.find((s) => s.id === id)
    if (!demo && session && activeSession(session)) setConfirm({
      title: '关闭终端会话',
      text: `${session.target.username}@${session.target.address} 的本地 SSH 会话将关闭。远端程序可能继续运行。`,
      action: () => closeSession(id, groupId)
    })
    else void closeSession(id, groupId).catch((error) => report(String(error)))
  }
  function cancelTask(id: string) {
    if (demo) setSample((value) => ({ ...value, tasks: value.tasks.map((task) => task.id === id
      ? { ...task, state: 'unknown', message: '演示：本地取消已请求，远端完成情况未知。', finishedAt: new Date().toISOString() } : task) }))
    else void window.supilot.request({ type: 'task.cancel', id }).catch((error) => report(String(error)))
  }
  function toggleDemo() {
    if (!demo && (real.sessions.some(activeSession) || real.tasks.some(activeTask))) return report('请先关闭真实终端并等待任务结束，再切换到独立演示模式。')
    if (editing && editDirty) return setConfirm({ title: '放弃未保存的修改', text: '主机表单尚未保存。切换模式会丢弃这些修改。', action: async () => { setEditing(undefined); setEditDirty(false); setDemo(true); setSample(demoSnapshot()); setPage('hosts') } })
    setDemo((value) => !value); setGroups([]); setPage('hosts'); setSelectedHost(''); setTrust(undefined); setToast(undefined)
  }

  const renderHosts = () => editing ? (
    <div className="simple-editor">
      <button className="back-link" onClick={closeEditor}><ArrowLeft size={15} />返回{editing.source === 'terminal' ? '终端' : '主机'}</button>
      <HostForm host={editing.host} demo={demo} onSave={saveHost} onCancel={closeEditor} onDirtyChange={setEditDirty} />
    </div>
  ) : (
    <div className="simple-page hosts-page">
      <div className="page-heading simple-heading"><div><span className="eyebrow"><Server size={15} /> 主机</span><h1>连接一台主机</h1><p>找到目标，点击连接。其余操作需要时再打开。</p></div><Button variant="primary" onClick={() => openEditor()}><Plus size={15} />添加主机</Button></div>
      <div className="host-toolbar"><div className="simple-search"><Search size={16} /><input ref={searchInput} aria-label="搜索主机" placeholder="搜索主机名称或地址…" value={search} onChange={(e) => setSearch(e.target.value)} />{search && <IconButton label="清除搜索" onClick={() => setSearch('')}><X size={13} /></IconButton>}<kbd>Ctrl K</kbd></div><span className="muted">{filtered.length} / {data.hosts.length} 台主机</span></div>
      {loadState === 'loading' && !demo && <div className="page-state" role="status"><LoaderCircle className="spin" size={18} />正在加载本机工作区…</div>}
      {loadState === 'error' && !demo && <div className="page-state error" role="alert"><AlertCircle size={18} /><div><strong>本机工作区暂时无法读取</strong><p>{snapshotError}</p><Button onClick={() => openEditor()}>添加主机</Button></div></div>}
      {loadState === 'ready' && real.engineError && !demo && <div className="page-state error" role="alert"><AlertCircle size={18} /><div><strong>本机工作区加载失败</strong><p>{real.engineError}</p><Button onClick={() => openEditor()}>添加主机</Button></div></div>}
      {loadState === 'ready' && !real.engineError && !demo && !real.sshAvailable && <div className="notice-strip"><AlertCircle size={15} />系统 OpenSSH 不可用，保存档案不会自动连接。请在 Windows 可选功能中安装 OpenSSH 客户端。</div>}
      {!filtered.length && loadState !== 'loading' ? <div className="empty-state simple-empty"><Server size={34} /><h2>{search ? '没有匹配的主机' : '先添加一台主机'}</h2><p>{search ? '尝试地址、分组或标签关键词。' : '填写名称、地址、端口、用户名和认证方式即可保存档案。'}</p>{!search && <Button variant="primary" onClick={() => openEditor()}><Plus size={15} />添加主机</Button>}</div> : <div className="host-list-simple" aria-label="主机列表">{filtered.map((host) => { const live = data.sessions.some((session) => session.target.id === host.id && activeSession(session)); return <article className={`host-card ${selectedHost === host.id ? 'selected' : ''}`} key={host.id} onClick={() => setSelectedHost(host.id)}><div className={`host-glyph ${live ? 'live' : ''}`}><Server size={18} /></div><div className="host-card-copy"><strong title={host.name}>{host.name}</strong><code title={endpoint(host)}>{endpoint(host)}</code><span>{host.group || '未分组'}{host.tags.length ? ` · ${host.tags.join(' · ')}` : ''}</span></div><div className="host-card-actions"><Button onClick={() => openHost(host)} disabled={busy}><TerminalSquare size={14} />{live ? '打开终端' : '连接'}<ArrowRight size={14} /></Button><IconButton label={`编辑 ${host.name}`} onClick={(event) => { event.stopPropagation(); openEditor(host) }}><Edit3 size={15} /></IconButton><IconButton label={host.local || host.source === 'ssh-config' ? '该主机不可删除' : `删除 ${host.name}`} disabled={host.local || host.source === 'ssh-config'} onClick={(event) => { event.stopPropagation(); deleteHost(host) }}><Trash2 size={15} /></IconButton></div></article> })}</div>}
      <p className="page-footnote"><ShieldCheck size={14} />主机数据保存在本机；连接前会执行信任核对。现有会话与任务使用创建时的固定目标。</p>
    </div>
  )

  const renderTerminal = () => (
    <div className="simple-page terminal-page">
      <div className="terminal-toolbar"><div className="session-tabs" role="tablist" aria-label="终端会话">{groups.map((group) => { const session = data.sessions.find((s) => s.id === group.focused); return <button role="tab" aria-selected={true} key={group.id} className="session-tab" onClick={() => { if (session) setSelectedHost(session.target.id); setPage('terminal') }}><TerminalSquare size={14} /><span>{session?.target.name || '终端会话'}</span><small>{group.sessionIds.length}</small></button> })}{!groups.length && <span className="muted">尚未打开终端</span>}</div><div className="terminal-toolbar-actions"><Button onClick={() => setQuickOpen(true)}><Plus size={14} />连接主机</Button>{activeGroup && <><IconButton label="左右分屏" onClick={() => split('horizontal')}><Columns2 size={15} /></IconButton><IconButton label="上下分屏" onClick={() => split('vertical')}><Rows2 size={15} /></IconButton></>}</div></div>
      {!groups.length && <div className="empty-state terminal-empty"><TerminalSquare size={38} /><h2>终端会话会留在这里</h2><p>从主机页连接一台主机。切换到工具、任务或设置时，SSH 会话、输出和输入保持不变。</p><Button variant="primary" onClick={() => setQuickOpen(true)}><Search size={15} />选择主机</Button></div>}
    </div>
  )

  const renderTools = () => (
    <div className="simple-page tools-page"><div className="simple-heading"><span className="eyebrow"><Activity size={15} /> 工具</span><h1>工具</h1><p>需要时再打开。终端会话保留，工具目标固定。</p></div><div className="tool-section-heading"><span>按需使用</span><span>{data.plugins.some((plugin) => plugin.id === 'diagnostics') ? '1 项工具' : '暂无可用工具'}</span></div>
      {data.plugins.some((plugin) => plugin.id === 'diagnostics') ? <article className="tool-card"><div className="tool-icon"><Activity size={20} /></div><div><h2>系统诊断 <span className="capability">只读</span></h2><p>检查系统、运行时间、磁盘与内存，结果保存到任务记录。</p><select aria-label="诊断目标" value={operationHost?.id || activeSessionValue?.target.id || selectedHostValue?.id || ''} onChange={(event) => { const host = data.hosts.find((item) => item.id === event.target.value); setSelectedHost(event.target.value); setOperationHost(host && structuredClone(host)) }}><option value="">选择主机</option>{data.hosts.map((host) => <option key={host.id} value={host.id}>{host.name} · {endpoint(host)}</option>)}</select></div><Button variant="primary" disabled={!operationHost && !activeSessionValue && !selectedHostValue} onClick={() => { const host = operationHost || activeSessionValue?.target || selectedHostValue; if (host) { setOperationHost(structuredClone(host)); setPage('diagnostic') } }}>{operationHost || activeSessionValue || selectedHostValue ? '打开诊断' : '选择主机'}<ArrowRight size={14} /></Button></article> : <div className="empty-state"><Activity size={32} /><h2>暂无可用工具</h2><p>当前版本只接入已实现的系统诊断。</p></div>}
      <p className="page-footnote"><ShieldCheck size={14} />文件传输、命令库和扩展市场尚未实现，不显示模拟入口。</p>
    </div>
  )
  const renderDiagnostic = () => <div className="simple-page diagnostic-page"><button className="back-link" onClick={() => setPage('tools')}><ArrowLeft size={15} />返回工具</button><Operations host={operationHost || activeSessionValue?.target} demo={demo} busy={busy} onRun={() => { const host = operationHost || activeSessionValue?.target; if (host) void connect({ host, kind: 'task' }) }} /></div>
  const renderTasks = () => <div className="simple-page tasks-view"><TasksPage tasks={data.tasks} initialId={taskId} onCancel={cancelTask} onSelect={setTaskId} /></div>

  const preservedTerminals = <div className={`terminal-preserved ${page === 'terminal' ? 'terminal-preserved-active' : ''}`} aria-hidden={page !== 'terminal'}>{groups.map((group) => <div className="preserved-group" key={group.id}><PanelGroup direction={group.direction}>{group.sessionIds.map((id, index) => { const session = data.sessions.find((s) => s.id === id); return session ? <Panel key={id} minSize={20}><TerminalPane session={session} index={index} visible={page === 'terminal'} focused={page === 'terminal' && group.focused === id} onFocus={() => setPage('terminal')} onClose={() => requestCloseSession(id, group.id)} report={report} /></Panel> : null }).flatMap((node, index) => index ? [<PanelResizeHandle className="resize-handle terminal-resize" key={`preserved-handle-${index}`} />, node] : [node])}</PanelGroup></div>)}</div>

  return <TooltipProvider><div className={`app-shell simple-shell ${demo ? 'demo-mode' : ''}`} data-page={page}><header className="app-header simple-header"><button className="brand" onClick={() => navigate('hosts')}><Compass size={17} /><strong>SuPilot</strong></button><nav className="primary-nav" aria-label="主要页面"><button className={page === 'hosts' || editing ? 'active' : ''} onClick={() => navigate('hosts')}>主机</button><button className={page === 'terminal' ? 'active' : ''} onClick={() => navigate('terminal')}>终端{groups.length > 0 && <span className="nav-count">{groups.reduce((count, group) => count + group.sessionIds.length, 0)}</span>}</button><button className={page === 'tools' || page === 'diagnostic' ? 'active' : ''} onClick={() => navigate('tools')}>工具</button></nav><div className="header-spacer" />{demo && <span className="demo-banner"><FlaskConical size={13} />演示模式 · 不连接真实主机</span>}{busy && <span className="busy-indicator"><LoaderCircle size={13} className="spin" />处理中</span>}<button className={`header-link ${tasksOverlay ? 'active' : ''}`} aria-label={`打开任务，${running} 项运行中，${attention} 项需要关注`} onClick={() => setTasksOverlay(true)}><ClipboardList size={15} />任务{running > 0 && <span className="nav-count">{running}</span>}</button><button className="header-link" aria-label="设置" onClick={() => setSettings(true)}><Settings2 size={15} />设置</button><button className="header-more" aria-label="演示模式" onClick={toggleDemo}><Menu size={16} /></button></header>{real.engineError && !demo && <div className="engine-error" role="alert">{real.engineError}</div>}<main className="simple-main">{editing ? renderHosts() : page === 'hosts' ? renderHosts() : page === 'terminal' ? renderTerminal() : page === 'tools' ? renderTools() : page === 'diagnostic' ? renderDiagnostic() : renderTasks()}</main>{preservedTerminals}{tasksOverlay && <Dialog open onClose={() => setTasksOverlay(false)} title="任务" description="查看进度和结果，不打断终端或丢失编辑内容。"><div className="task-overlay-list">{data.tasks.slice(0, 5).map((task) => <button key={task.id} className="task-overlay-row" onClick={() => { setTasksOverlay(false); openTasks(task.id) }}><span><strong>{task.title}</strong><small>{task.target.name}</small></span><Status state={task.state} /><ArrowRight size={14} /></button>)}{!data.tasks.length && <div className="overlay-empty"><ClipboardList size={27} /><h3>暂无任务</h3><p>从工具页发起只读诊断后，结果会集中在这里。</p></div>}<Button variant="ghost" onClick={() => { setTasksOverlay(false); openTasks() }}>查看全部任务<ArrowRight size={14} /></Button></div></Dialog>}{quickOpen && <QuickOpen hosts={data.hosts} onClose={() => setQuickOpen(false)} onOpen={openHost} />}{settings && <Dialog open onClose={() => setSettings(false)} title="设置" description="应用字号与终端字号分别设置，ANSI 配色不会改变应用主题。"><div className="settings-fields"><label className="field"><span>界面字号 · {ui.uiSize}px</span><input aria-label="界面字号" type="range" min={12} max={17} value={ui.uiSize} onChange={(event) => ui.set({ uiSize: Number(event.target.value) })} /></label><label className="field"><span>终端字号 · {ui.terminalSize}px</span><input aria-label="终端字号" type="range" min={11} max={22} value={ui.terminalSize} onChange={(event) => ui.set({ terminalSize: Number(event.target.value) })} /></label><label className="field"><span>终端 ANSI 配色</span><select aria-label="终端 ANSI 配色" value={ui.ansi} onChange={(event) => ui.set({ ansi: event.target.value as typeof ui.ansi })}><option value="dark-plus">Dark+ · VS Code 经典深色</option><option value="graphite">Graphite · 柔和冷色</option><option value="classic">Classic · 经典配色</option></select></label></div><div className="inline-note"><Keyboard size={16} /><span>Ctrl+C / Ctrl+D / Ctrl+R 直接交给 Shell。使用 Ctrl+Shift+C / V 复制粘贴。</span></div><p className="small">{data.dataPath}</p><div className="form-actions"><Button onClick={() => setSettings(false)}>完成</Button></div></Dialog>}{trust && <Dialog open onClose={() => setTrust(undefined)} title="核对服务器身份" description="这是首次连接。请从服务器控制台或可信管理员处独立核对以下指纹；扫描得到的指纹本身不能证明服务器身份。"><div className="trust-target"><strong>{trust.challenge.target.name}</strong><code>{endpoint(trust.challenge.target)}</code></div><div className="fingerprints">{trust.challenge.keys.map((key) => <div key={key.algorithm}><span>{key.algorithm}</span><code>{key.fingerprint}</code></div>)}</div><p className="small">确认后仅写入 SuPilot 专属 known_hosts，不修改系统 SSH 文件。</p><div className="form-actions"><Button onClick={() => setTrust(undefined)}>取消连接</Button><Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); const value = trust; try { const challenge = await window.supilot.request({ type: 'trust.accept', token: value.challenge.token }); setTrust(undefined); await completeConnection(challenge, value.intent) } catch (error) { report(String(error)) } finally { setBusy(false) } }}>已独立核对，信任并继续</Button></div></Dialog>}{confirm && <Dialog open onClose={() => setConfirm(undefined)} title={confirm.title} description={confirm.text}><div className="form-actions"><Button onClick={() => setConfirm(undefined)}>返回</Button><Button variant="danger" onClick={() => { const action = confirm.action; setConfirm(undefined); void action().catch((error) => report(String(error))) }}>确认</Button></div></Dialog>}{toast && <div className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<span>{toast.message}</span><IconButton label="关闭提示" onClick={() => setToast(undefined)}><X size={14} /></IconButton></div>}</div></TooltipProvider>
}
