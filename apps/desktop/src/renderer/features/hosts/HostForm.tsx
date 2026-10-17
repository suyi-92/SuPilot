import { useEffect, useId, useRef, useState } from 'react'
import { HostInput, type Host, type HostDraft } from '@supilot/contracts'
import { Button } from '@supilot/ui'
import { AlertCircle, FolderOpen, KeyRound, Save, Server, ShieldCheck } from 'lucide-react'
import { endpoint } from '../../app/format'

export const draftOf = (host: Host): HostDraft => {
  const { updatedAt, ...draft } = host
  return draft
}

export type ValidationIssue = {
  path: PropertyKey[]
  code: string
  message: string
  expected?: string
  minimum?: number | bigint
  maximum?: number | bigint
  origin?: string
}

const fieldLabels: Record<string, string> = {
  name: '主机名称',
  address: '主机地址',
  port: '公网连接端口',
  sshdPort: '远端监听端口',
  username: '用户名',
  group: '分组',
  keyPath: '私钥文件路径',
  tags: '标签',
  notes: '备注',
  form: '保存失败'
}

const portMessage = (label: string) => `${label}必须是 1–65535 之间的整数`

export function formatHostIssues(
  issues: readonly ValidationIssue[],
  form: HostDraft,
  absolutePathIssue?: ValidationIssue
) {
  const result: Record<string, string> = {}
  for (const issue of issues) {
    const first = issue.path[0]
    const key = typeof first === 'string' ? first : issue === absolutePathIssue ? 'keyPath' : 'form'
    const label = fieldLabels[key] || '输入'
    let message = issue.message
    if (key === 'port' || key === 'sshdPort') {
      if (issue.code === 'invalid_type' && issue.expected === 'int') message = portMessage(label)
      else if (issue.code === 'invalid_type') message = `${label}必须是数字，范围为 1–65535`
      else if (issue.code === 'too_small' || issue.code === 'too_big') message = portMessage(label)
    } else if (key === 'tags' && typeof issue.path[1] === 'number') {
      if (issue.code === 'too_big') message = `第 ${issue.path[1] + 1} 个标签最多 ${issue.maximum} 个字符`
      else if (issue.code === 'too_small') message = `第 ${issue.path[1] + 1} 个标签不能为空`
    } else if (key === 'tags' && issue.code === 'too_big' && issue.origin === 'array') {
      message = `标签最多 ${issue.maximum} 个，请减少标签数量`
    } else if (issue.code === 'invalid_type' && issue.expected === 'int') {
      message = `${label}必须是整数`
    } else if (issue.code === 'invalid_type') {
      message = `${label}不能为空`
    } else if (issue.code === 'too_small') {
      message = `${label}不能为空`
    } else if (issue.code === 'too_big') {
      message = issue.origin === 'string' ? `${label}最多 ${issue.maximum} 个字符` : issue.message
    } else if (issue.code === 'invalid_value') message = '请选择 SSH Agent 或已有私钥文件'
    else if (issue.code === 'invalid_format' && key === 'address') {
      message = '请输入域名、IPv4 或不带方括号的 IPv6 地址'
    } else if (issue.code === 'invalid_format' && key === 'username') {
      message = '用户名须以字母、数字或下划线开头，只能包含字母、数字、点、下划线、连字符或 @'
    } else if (issue.code === 'custom' && key === 'keyPath' && issue.path.length > 0 && /[\r\n\0]/.test(form.keyPath)) {
      message = '私钥文件路径不能包含换行或空字符'
    } else if (issue === absolutePathIssue) {
      message = '私钥文件路径必须是绝对路径（仅检查格式，不读取文件）'
    }
    result[key] = result[key] ? `${result[key]}；${message}` : message
  }
  return result
}

export function validateHostDraft(form: HostDraft) {
  const parsed = HostInput.safeParse(form)
  let absolutePathIssue: ValidationIssue | undefined
  if (!parsed.success && form.auth === 'key') {
    // Attribute only the actual schema issue removed by changing authentication.
    // Unknown caller-provided root issues never become links to keyPath.
    const roots = parsed.error.issues.filter((issue) => issue.path.length === 0)
    const agent = HostInput.safeParse({ ...form, auth: 'agent' })
    if (roots.length === 1 && roots[0].code === 'custom' &&
        (agent.success || !agent.error.issues.some((issue) => issue.path.length === 0))) {
      absolutePathIssue = roots[0]
    }
  }
  return { parsed, errors: parsed.success ? {} : formatHostIssues(parsed.error.issues, form, absolutePathIssue) }
}

const tagsFromText = (value: string) => [
  ...new Set(
    value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  )
]

export function HostForm({
  host,
  demo,
  onSave,
  onCancel,
  onDirtyChange
}: {
  host?: Host
  demo: boolean
  onSave: (draft: HostDraft) => Promise<void>
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [form, setForm] = useState<HostDraft>(
    host
      ? draftOf(host)
      : {
          name: '',
          address: '',
          port: 22,
          sshdPort: null,
          username: 'root',
          auth: 'agent',
          keyPath: '',
          group: '',
          tags: [],
          notes: ''
        }
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [tagsText, setTagsText] = useState(host?.tags.join(', ') || '')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(host?.sshdPort))
  const prefix = useId()
  const summary = useRef<HTMLDivElement>(null)
  const baseline = useRef(JSON.stringify({ form, tagsText }))
  const dirty = baseline.current !== JSON.stringify({ form, tagsText })
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty])
  const fieldProps = (key: keyof HostDraft) => ({
    id: `${prefix}-${key}`,
    'aria-invalid': !!errors[key],
    'aria-describedby': `${prefix}-${key}-help`
  })
  const errorLabels = fieldLabels
  const update = <K extends keyof HostDraft>(key: K, value: HostDraft[K]) => {
    const nextForm = { ...form, [key]: value }
    setForm(nextForm)
    setErrors((v) => {
      const next = { ...v }
      delete next[key]
      if ((key === 'auth' && value === 'agent') ||
          (key === 'keyPath' && nextForm.auth === 'agent' && v.keyPath)) {
        const applicable = validateHostDraft({ ...nextForm, tags: tagsFromText(tagsText) }).errors
        if (applicable.keyPath) next.keyPath = applicable.keyPath
        else delete next.keyPath
      }
      return next
    })
  }
  const field = (key: keyof HostDraft, label: string, input: React.ReactNode, help?: string) => (
    <div className="field" data-invalid={!!errors[key]}>
      <div className="field-label">
        <label htmlFor={`${prefix}-${key}`}>{label}</label>
        {['name', 'address', 'username', 'port'].includes(key) && (
          <span className="required-mark" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </div>
      {input}
      <small id={`${prefix}-${key}-help`} className={errors[key] ? 'error' : undefined}>
        {errors[key] || help}
      </small>
    </div>
  )
  return (
    <div className="page-scroll host-form-scroll">
      <div className="content-page form-page">
        <div className="eyebrow">
          <Server size={14} /> 主机档案 / {host ? '编辑' : '新建'}
        </div>
        <h1>{host ? `编辑 ${host.name}` : '添加主机'}</h1>
        <p className="page-lead">填写连接信息，保存后即可从主机列表打开终端。</p>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault()
            if (saving.current) return
            const { parsed, errors: nextErrors } = validateHostDraft({
              ...form,
              tags: tagsFromText(tagsText)
            })
            if (!parsed.success) {
              setErrors(nextErrors)
              if (nextErrors.sshdPort) setAdvancedOpen(true)
              requestAnimationFrame(() => summary.current?.focus())
              return
            }
            setErrors({})
            saving.current = true
            setBusy(true)
            try {
              await onSave(parsed.data)
            } catch (error) {
              setErrors({ form: String(error) })
              requestAnimationFrame(() => summary.current?.focus())
            } finally {
              saving.current = false
              setBusy(false)
            }
          }}
        >
          {Object.keys(errors).length > 0 && (
            <div className="form-error-summary" ref={summary} tabIndex={-1} role="alert">
              <strong>
                <AlertCircle size={16} />
                请检查以下内容（{Object.keys(errors).length} 项）
              </strong>
              {Object.entries(errors).map(([key, value]) => (
                !['name', 'address', 'port', 'sshdPort', 'username', 'group', 'keyPath', 'tags', 'notes'].includes(key) ? (
                  <p key={key}>{errorLabels[key]}：{value}</p>
                ) : (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (key === 'sshdPort') setAdvancedOpen(true)
                      requestAnimationFrame(() => {
                        const input = document.getElementById(`${prefix}-${key}`)
                        input?.focus({ preventScroll: true })
                        input?.scrollIntoView({ block: 'center' })
                      })
                    }}
                  >
                    {errorLabels[key] || key}：{value}
                  </button>
                )
              ))}
            </div>
          )}
          <section className="form-section">
            <h2>连接信息</h2>
            <div className="form-grid">
              {field(
                'name',
                '主机名称',
                <input
                  {...fieldProps('name')}
                  autoFocus
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="例如：东京 · 应用服务器"
                />
              )}
              {field(
                'address',
                '主机地址',
                <input
                  {...fieldProps('address')}
                  required
                  value={form.address}
                  onChange={(e) => update('address', e.target.value)}
                  placeholder="域名、IPv4 或 IPv6"
                />
              )}
              {field(
                'port',
                '公网连接端口',
                <input
                  {...fieldProps('port')}
                  type="number"
                  required
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(e) => update('port', Number(e.target.value))}
                />,
                'SuPilot 实际连接的端口，可与 NAT 内部端口不同。'
              )}
              {field(
                'username',
                '用户名',
                <input
                  {...fieldProps('username')}
                  required
                  value={form.username}
                  onChange={(e) => update('username', e.target.value)}
                />
              )}
            </div>
          </section>
          <section className="form-section">
            <h2>
              <KeyRound size={15} /> 认证方式
            </h2>
            <div className="auth-options">
              <label className={form.auth === 'agent' ? 'chosen' : ''}>
                <input
                  type="radio"
                  name="auth"
                  checked={form.auth === 'agent'}
                  onChange={() => update('auth', 'agent')}
                />
                <div>
                  <strong>SSH Agent</strong>
                  <small>使用系统 Agent 已加载的密钥</small>
                </div>
              </label>
              <label className={form.auth === 'key' ? 'chosen' : ''}>
                <input
                  type="radio"
                  name="auth"
                  checked={form.auth === 'key'}
                  onChange={() => update('auth', 'key')}
                />
                <div>
                  <strong>已有私钥文件</strong>
                  <small>仅保存本地文件路径引用</small>
                </div>
              </label>
            </div>
            {(form.auth === 'key' || !!errors.keyPath) &&
              field(
                'keyPath',
                '私钥文件路径',
                <div className="input-action">
                  <input
                    {...fieldProps('keyPath')}
                    value={form.keyPath}
                    onChange={(e) => update('keyPath', e.target.value)}
                    placeholder="C:\Users\you\.ssh\id_ed25519"
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      if (demo) {
                        setErrors({ keyPath: '演示模式不访问本地私钥。可填写合成路径用于预览。' })
                        return
                      }
                      void window.supilot
                        .chooseKey()
                        .then((path) => {
                          if (path) update('keyPath', path)
                        })
                        .catch((e) => setErrors({ keyPath: String(e) }))
                    }}
                  >
                    <FolderOpen size={15} />
                    选择文件
                  </Button>
                </div>
              )}
            <div className="inline-note">
              <ShieldCheck size={16} />
              <span>
                不保存密码或私钥口令。加密密钥可在终端中输入口令，后台诊断需要已就绪的密钥或 Agent。
              </span>
            </div>
          </section>
          <section className="form-section">
            <h2>整理与备注</h2>
            {field(
              'group',
              '分组',
              <input
                {...fieldProps('group')}
                value={form.group}
                maxLength={60}
                onChange={(e) => update('group', e.target.value)}
                placeholder="例如：生产环境"
              />
            )}
            {field(
              'tags',
              '标签（逗号分隔）',
              <input
                {...fieldProps('tags')}
                value={tagsText}
                onChange={(e) => {
                  setTagsText(e.target.value)
                  setErrors((v) => {
                    const next = { ...v }
                    delete next.tags
                    return next
                  })
                }}
                placeholder="debian, edge"
              />
            )}
            {field(
              'notes',
              '备注',
              <textarea
                {...fieldProps('notes')}
                rows={3}
                maxLength={4000}
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="记录主机用途。请勿填写密码或令牌。"
              />
            )}
          </section>
          <details
            className="form-section form-advanced"
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                高级记录
                {form.sshdPort ? <small>已记录远端监听端口 {form.sshdPort}</small> : <small>可选</small>}
              </span>
            </summary>
            <p className="section-help">仅供档案记录，不参与本次实际连接，也不会修改远端配置。</p>
            {field(
              'sshdPort',
              '远端 sshd 监听端口（可选）',
              <input
                {...fieldProps('sshdPort')}
                type="number"
                min={1}
                max={65535}
                value={form.sshdPort ?? ''}
                onChange={(e) => update('sshdPort', e.target.value ? Number(e.target.value) : null)}
                placeholder="未知时留空"
              />,
              '仅供记录；实际连接仍使用上方公网连接端口。'
            )}
          </details>
          {host && (
            <p className="muted small">档案修改仅用于后续新操作；现有会话与任务保留原连接快照。</p>
          )}
          <div className="form-actions host-form-actions">
            <div className="form-connection-preview">
              <span>{demo ? '演示档案 · 仅保存到内存' : '连接预览'}</span>
              <code>{form.address ? endpoint(form) : '填写主机地址后显示连接目标'}</code>
            </div>
            <Button type="button" onClick={onCancel}>
              取消
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              <Save size={14} />
              {busy ? '正在保存…' : demo ? '保存演示档案' : '保存主机'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
