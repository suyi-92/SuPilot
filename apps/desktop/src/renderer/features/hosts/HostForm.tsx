import { useEffect, useId, useRef, useState } from 'react'
import { HostInput, type Host, type HostDraft } from '@supilot/contracts'
import { Button } from '@supilot/ui'
import { AlertCircle, FolderOpen, KeyRound, Save, Server, ShieldCheck } from 'lucide-react'
import { endpoint } from '../../app/format'

export const draftOf = (host: Host): HostDraft => {
  const { updatedAt, ...draft } = host
  return draft
}
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
  const errorLabels: Record<string, string> = {
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
  const update = <K extends keyof HostDraft>(key: K, value: HostDraft[K]) => {
    setForm((v) => ({ ...v, [key]: value }))
    setErrors((v) => {
      const next = { ...v }
      delete next[key]
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
            const parsed = HostInput.safeParse({
              ...form,
              tags: [
                ...new Set(
                  tagsText
                    .split(/[,，]/)
                    .map((t) => t.trim())
                    .filter(Boolean)
                )
              ]
            })
            if (!parsed.success) {
              setErrors(
                Object.fromEntries(
                  parsed.error.issues.map((i) => [String(i.path[0] || 'form'), i.message])
                )
              )
              requestAnimationFrame(() => summary.current?.focus())
              return
            }
            setErrors({})
            setBusy(true)
            try {
              await onSave(parsed.data)
            } catch (error) {
              setErrors({ form: String(error) })
              requestAnimationFrame(() => summary.current?.focus())
            } finally {
              setBusy(false)
            }
          }}
        >
          {Object.keys(errors).length > 0 && (
            <div className="form-error-summary" ref={summary} tabIndex={-1} role="alert">
              <strong>
                <AlertCircle size={16} />
                请检查以下内容
              </strong>
              {Object.entries(errors).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => document.getElementById(`${prefix}-${key}`)?.focus()}
                >
                  {errorLabels[key] || key}：{value}
                </button>
              ))}
            </div>
          )}
          <section className="form-section">
            <h2>连接目标</h2>
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
                'sshdPort',
                '远端 sshd 监听端口（可选）',
                <input
                  {...fieldProps('sshdPort')}
                  type="number"
                  min={1}
                  max={65535}
                  value={form.sshdPort ?? ''}
                  onChange={(e) =>
                    update('sshdPort', e.target.value ? Number(e.target.value) : null)
                  }
                  placeholder="未知时留空"
                />,
                '仅作档案记录，不据此修改远端配置。'
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
            {form.auth === 'key' &&
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
              'tags',
              '标签（逗号分隔）',
              <input
                {...fieldProps('tags')}
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
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
