import { useEffect, useState } from 'react'
import type { Task } from '@supilot/contracts'
import { activeTask } from '@supilot/contracts'
import { Button, IconButton, Status } from '@supilot/ui'
import {
  AlertCircle,
  CheckCheck,
  ClipboardList,
  Copy,
  FileText,
  LockKeyhole,
  Search,
  ShieldCheck,
  Square,
  WrapText,
  X
} from 'lucide-react'
import { endpoint } from '../../app/format'

export const time = (value?: string) =>
  value
    ? new Date(value).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    : '尚未完成'

export type TaskResultSummary = {
  headline: string
  detail: string
  nextStep: string
  tone: 'progress' | 'success' | 'warning' | 'danger' | 'neutral'
  counts: { succeeded: number; unavailable: number; failed: number; unfinished: number }
}

export function taskResultSummary(task: Task): TaskResultSummary {
  const counts = {
    succeeded: task.steps.filter((step) => step.state === 'succeeded').length,
    unavailable: task.steps.filter((step) => step.state === 'unavailable').length,
    failed: task.steps.filter((step) => step.state === 'failed').length,
    unfinished: task.steps.filter((step) => ['pending', 'running', 'unknown'].includes(step.state)).length
  }
  const reason = task.message || ''
  if (task.state === 'running') {
    return {
      headline: '正在执行，结果尚未齐全',
      detail: reason || '正在通过独立 SSH 通道执行只读检查。',
      nextStep: '等待任务结束后查看每个步骤的原始输出。',
      tone: 'progress',
      counts
    }
  }
  if (task.state === 'cancel-requested') {
    return {
      headline: '已请求取消，等待确认结束',
      detail: reason || 'Engine 尚未确认任务已取消，远端结果仍不能推断。',
      nextStep: '等待状态更新；在确认前不要把任务当作已取消。',
      tone: 'warning',
      counts
    }
  }
  if (task.state === 'cancelled') {
    return {
      headline: '任务已取消',
      detail: reason || 'Engine 已确认本次任务取消。',
      nextStep: '如需继续，请检查目标和认证准备后从诊断页重新开始。',
      tone: 'neutral',
      counts
    }
  }
  if (task.state === 'interrupted') {
    return {
      headline: '执行中断，结果未完全确认',
      detail: reason || '连接或执行通道中断，未收到完整的远端结果。',
      nextStep: '先核对目标与连接状态，再查看中断步骤的退出码和日志。',
      tone: 'danger',
      counts
    }
  }
  if (task.state === 'unknown') {
    return {
      headline: '结果未知',
      detail: reason || '任务结束状态未能确认，不能推断远端是否完成。',
      nextStep: '核对目标和连接记录；不要用重试代替结果确认。',
      tone: 'warning',
      counts
    }
  }
  if (task.state === 'failed') {
    return {
      headline: '任务未成功',
      detail: reason || '至少一个步骤失败，请查看失败步骤和原始输出。',
      nextStep: '根据已有错误信息检查认证准备、目标和退出码。',
      tone: 'danger',
      counts
    }
  }
  if (counts.unavailable > 0) {
    return {
      headline: '检查完成，部分项不可用',
      detail: reason || `${counts.succeeded} 项完成，${counts.unavailable} 项未能执行。`,
      nextStep: '查看不可用步骤的说明；完成不代表服务器健康或所有资源正常。',
      tone: 'warning',
      counts
    }
  }
  return {
    headline: '只读检查已完成',
    detail: reason || '本次检查按现有契约完成。',
    nextStep: '完成只表示本次查询返回，不等于服务器健康或所有资源正常。',
    tone: 'success',
    counts
  }
}

function Duration({ task }: { task: Task }) {
  const [now, setNow] = useState(Date.now())
  const running = activeTask(task)
  useEffect(() => {
    if (!running || task.demo) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running, task.demo])
  if (task.demo && running) return <span>演示运行中</span>
  if (!running && !task.finishedAt) return <span>耗时未记录</span>
  const seconds = Math.max(
    0,
    Math.floor(
      ((task.finishedAt ? Date.parse(task.finishedAt) : now) - Date.parse(task.createdAt)) / 1000
    )
  )
  return (
    <span>
      {running ? '已运行 ' : '耗时 '}
      {seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ` : ''}
      {seconds % 60} 秒
    </span>
  )
}

export function TaskDetail({ task, onCancel }: { task: Task; onCancel: () => void }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [wrap, setWrap] = useState(false)
  const [stepId, setStepId] = useState(
    task.steps.find((s) => ['failed', 'unknown', 'interrupted', 'running'].includes(s.state))?.id ||
      task.steps[0]?.id
  )
  const step = task.steps.find((s) => s.id === stepId) || task.steps[0]
  const log = `${task.title} · ${task.target.name}\n${task.message || ''}\n${task.steps.map((s) => `[${s.title}] ${s.state}\n${s.output || '无输出'}`).join('\n\n')}`
  const summary = taskResultSummary(task)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 3000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <div className="task-detail">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <ClipboardList size={14} />
            执行记录 {task.demo && <span className="demo-chip">演示</span>}
          </div>
          <h1>{task.title}</h1>
        </div>
        <Status state={task.state} />
      </div>
      <div className="task-meta">
        <div className="task-target">
          <span>
            <LockKeyhole size={12} />
            固定目标
          </span>
          <strong>{task.target.name}</strong>
          <code>{endpoint(task.target)}</code>
        </div>
        <div>
          <span>开始时间</span>
          <strong>{time(task.createdAt)}</strong>
          <small>
            <Duration task={task} />
            {task.finishedAt && <span title={time(task.finishedAt)}> · 已结束</span>}
          </small>
        </div>
        <div>
          <span>执行范围</span>
          <strong>
            <ShieldCheck size={14} />
            单机 · 只读
          </strong>
          <small>
            成功 {summary.counts.succeeded} / 共 {task.steps.length}
            {summary.counts.unavailable ? ` · 不可用 ${summary.counts.unavailable}` : ''}
            {summary.counts.failed ? ` · 失败 ${summary.counts.failed}` : ''}
            {summary.counts.unfinished ? ` · 未完成 ${summary.counts.unfinished}` : ''}
          </small>
        </div>
      </div>
      <div className={`result-message result-${task.state} result-tone-${summary.tone}`}>
        {summary.tone === 'success' ? <CheckCheck size={16} /> : <AlertCircle size={16} />}
        <div>
          <strong>{summary.headline}</strong>
          <p>{summary.detail}</p>
          <small>{summary.nextStep}</small>
        </div>
      </div>
      <div className="results-heading">
        <h2>检查结果</h2>
        <span>选择步骤查看原始输出</span>
      </div>
      <div className="steps-layout">
        <nav className="steps-nav" aria-label="诊断步骤">
          {task.steps.map((s, i) => (
            <button
              key={s.id}
              className={s.id === step?.id ? 'selected' : ''}
              aria-pressed={s.id === step?.id}
              onClick={() => setStepId(s.id)}
            >
              <span className="step-number">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <strong>{s.title}</strong>
                <Status state={s.state} />
              </div>
            </button>
          ))}
        </nav>
        <section className="log-panel" aria-label="步骤输出">
          <header>
            <FileText size={14} />
            <strong>{step?.title || '执行输出'}</strong>
            <span className="readonly-label">只读</span>
            <span className="flex-1" />
            {step?.exitCode !== undefined && <code>exit {step.exitCode}</code>}
            <IconButton label="自动换行" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>
              <WrapText size={15} />
            </IconButton>
          </header>
          <pre tabIndex={0} aria-label="只读诊断日志" className={wrap ? 'wrap' : ''}>
            {step?.output ||
              (step?.state === 'running'
                ? '正在等待 SSH 返回结果…'
                : step?.state === 'pending'
                  ? '此步骤尚未执行。'
                  : '没有收到输出，请查看上方任务说明。')}
          </pre>
        </section>
      </div>
      <div className="task-actions">
        <span className="muted small">目标与连接参数已在任务创建时固定。</span>
        {copyError && (
          <span className="error" role="alert" aria-live="polite">
            复制失败，请重试。
          </span>
        )}
        <Button
          onClick={() =>
            void navigator.clipboard
              .writeText(log)
              .then(() => {
                setCopied(true)
                setCopyError(false)
              })
              .catch(() => setCopyError(true))
          }
        >
          {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
          {copied ? '已复制日志' : '复制完整日志'}
        </Button>
        {activeTask(task) && (
          <Button variant="danger" onClick={onCancel} disabled={task.state === 'cancel-requested'}>
            <Square size={12} />
            请求取消
          </Button>
        )}
      </div>
    </div>
  )
}

export function TasksPage({
  tasks,
  initialId,
  onCancel,
  onSelect
}: {
  tasks: Task[]
  initialId?: string
  onCancel: (id: string) => void
  onSelect: (id?: string) => void
}) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const matchFilter = (t: Task) =>
    filter === 'all' ||
    (filter === 'attention'
      ? ['failed', 'unknown', 'interrupted'].includes(t.state)
      : activeTask(t))
  const filtered = tasks.filter(
    (t) =>
      matchFilter(t) &&
      `${t.title} ${t.target.name} ${t.target.address}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
  )
  const task = filtered.find((t) => t.id === initialId) || filtered[0]
  // Keep the surrounding inspector bound to the task that is actually displayed.
  useEffect(() => {
    if (task?.id !== initialId) onSelect(task?.id)
  }, [task?.id, initialId, onSelect])
  const filterInput = (
    <select aria-label="筛选任务" value={filter} onChange={(e) => setFilter(e.target.value)}>
      <option value="all">全部任务</option>
      <option value="active">正在运行</option>
      <option value="attention">需要关注</option>
    </select>
  )
  return (
    <div className="tasks-page">
      <aside className="task-history">
        <div className="history-heading">
          <h2>任务记录</h2>
          <span>
            {filtered.length} / {tasks.length}
          </span>
        </div>
        {filterInput}
        <div className="history-search">
          <Search size={13} />
          <input
            aria-label="搜索任务主机"
            placeholder="按主机筛选…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="history-list">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={task?.id === t.id ? 'selected' : ''}
              aria-pressed={task?.id === t.id}
              title={`${t.target.name}\n${endpoint(t.target)}\n${time(t.createdAt)}`}
            >
              <span className="history-host truncate">{t.target.name}</span>
              <div>
                <strong>{t.title}</strong>
                <Status state={t.state} />
              </div>
              <small>
                {time(t.createdAt)}
                {t.demo ? ' · 演示' : ''}
              </small>
            </button>
          ))}
          {!filtered.length && <p className="history-empty">没有匹配的任务</p>}
        </div>
      </aside>
      <div className="page-scroll task-result-scroll">
        <div className="compact-task-picker">
          {filterInput}
          <select
            aria-label="选择任务记录"
            value={task?.id || ''}
            onChange={(e) => onSelect(e.target.value)}
          >
            {!filtered.length && <option value="">没有匹配的任务</option>}
            {filtered.map((t) => (
              <option key={t.id} value={t.id}>
                {t.target.name} · {time(t.createdAt)}
                {t.demo ? ' · 演示' : ''}
              </option>
            ))}
          </select>
          {search && (
            <button className="compact-search-chip" onClick={() => setSearch('')}>
              筛选：{search}
              <X size={13} aria-hidden="true" />
              <span className="sr-only">清除主机筛选</span>
            </button>
          )}
        </div>
        {task ? (
          <TaskDetail key={task.id} task={task} onCancel={() => onCancel(task.id)} />
        ) : (
          <div className="empty-state">
            <ClipboardList size={32} />
            <h2>{tasks.length ? '没有匹配的记录' : '还没有诊断记录'}</h2>
            <p>
              {tasks.length
                ? '调整筛选条件，或返回全部任务。'
                : '选中主机并运行系统诊断，步骤与结果会保存在这里。'}
            </p>
            {tasks.length > 0 && (
              <Button
                onClick={() => {
                  setFilter('all')
                  setSearch('')
                }}
              >
                显示全部任务
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
