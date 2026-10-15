import { useState } from 'react'
import type { Task } from '@supilot/contracts'
import { activeTask } from '@supilot/contracts'
import { Button, Status } from '@supilot/ui'
import { CheckCheck, ClipboardList, Copy, FileText, ShieldCheck, Square } from 'lucide-react'

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
export function TaskDetail({ task, onCancel }: { task: Task; onCancel: () => void }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [stepId, setStepId] = useState(task.steps[0]?.id)
  const step = task.steps.find((s) => s.id === stepId) || task.steps[0]
  const log = `${task.title} · ${task.target.name}\n${task.message || ''}\n${task.steps.map((s) => `[${s.title}] ${s.state}\n${s.output || '无输出'}`).join('\n\n')}`
  return (
    <div className="task-detail">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <ClipboardList size={14} /> 任务记录 {task.demo && ' / 演示数据'}
          </div>
          <h1>{task.title}</h1>
        </div>
        <Status state={task.state} />
      </div>
      <div className="task-meta">
        <div>
          <span>目标主机</span>
          <strong>{task.target.name}</strong>
          <code>
            {task.target.username}@{task.target.address}:{task.target.port}
          </code>
        </div>
        <div>
          <span>开始时间</span>
          <strong>{time(task.createdAt)}</strong>
          <small>结束：{time(task.finishedAt)}</small>
        </div>
        <div>
          <span>执行范围</span>
          <strong>
            <ShieldCheck size={15} /> 单机 · 只读
          </strong>
          <small>
            {task.steps.filter((s) => s.state === 'succeeded').length} / {task.steps.length}{' '}
            项已完成
          </small>
        </div>
      </div>
      <div
        className={`result-message ${['failed', 'unknown', 'interrupted'].includes(task.state) ? 'attention' : ''}`}
      >
        <Status state={task.state} />
        <span>{task.message || '正在通过独立 SSH 通道执行，请稍候。'}</span>
      </div>
      <div className="steps-layout">
        <nav className="steps-nav" aria-label="诊断步骤">
          {task.steps.map((s, i) => (
            <button
              key={s.id}
              className={s.id === step?.id ? 'selected' : ''}
              onClick={() => setStepId(s.id)}
            >
              <span className="step-number">0{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <Status state={s.state} />
              </div>
            </button>
          ))}
        </nav>
        <section className="log-panel">
          <header>
            <FileText size={15} />
            <strong>{step?.title || '执行输出'}</strong>
            <span className="readonly-label">只读记录</span>
            {step?.exitCode !== undefined && <code>exit {step.exitCode}</code>}
          </header>
          <pre tabIndex={0}>
            {step?.output ||
              (step?.state === 'running'
                ? '正在等待独立 SSH 通道返回结果…'
                : step?.state === 'pending'
                  ? '此步骤尚未执行，没有可展示的结果。'
                  : '没有收到输出。请查看任务状态说明。')}
          </pre>
        </section>
      </div>
      <div className="task-actions">
        <span className="muted small">任务绑定创建时的连接快照；不会跟随主机档案修改。</span>
        {copyError && <span className="error">复制失败</span>}
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
          {copied ? <CheckCheck size={15} /> : <Copy size={15} />}
          {copied ? '已复制日志' : '复制完整日志'}
        </Button>
        {activeTask(task) && (
          <Button variant="danger" onClick={onCancel} disabled={task.state === 'cancel-requested'}>
            <Square size={13} />
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
  onSelect: (id: string) => void
}) {
  const [filter, setFilter] = useState('all')
  const task = tasks.find((t) => t.id === initialId) || tasks[0]
  const filtered = tasks.filter(
    (t) =>
      filter === 'all' ||
      (filter === 'attention'
        ? ['failed', 'unknown', 'interrupted'].includes(t.state)
        : activeTask(t))
  )
  return (
    <div className="tasks-page">
      <aside className="task-history">
        <div className="history-heading">
          <h2>任务记录</h2>
          <span>{tasks.length}</span>
        </div>
        <select aria-label="筛选任务" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">全部任务</option>
          <option value="active">正在运行</option>
          <option value="attention">需要关注</option>
        </select>
        <div className="history-list">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={task?.id === t.id ? 'selected' : ''}
            >
              <div>
                <strong>{t.title}</strong>
                <Status state={t.state} />
              </div>
              <span className="truncate">{t.target.name}</span>
              <small>
                {time(t.createdAt)}
                {t.demo ? ' · 演示' : ''}
              </small>
            </button>
          ))}
          {!filtered.length && <p className="muted small">暂无符合条件的任务。</p>}
        </div>
      </aside>
      <div className="page-scroll">
        {task ? (
          <TaskDetail key={task.id} task={task} onCancel={() => onCancel(task.id)} />
        ) : (
          <div className="empty-state">
            <ClipboardList size={38} />
            <h2>这里会记录每一次检查</h2>
            <p>从主机详情打开系统诊断，即可查看步骤、结果和只读日志。</p>
          </div>
        )}
      </div>
    </div>
  )
}
