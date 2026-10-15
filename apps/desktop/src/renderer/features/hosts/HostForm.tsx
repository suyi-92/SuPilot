import { useState } from 'react'
import { HostInput, type Host, type HostDraft } from '@supilot/contracts'
import { Button } from '@supilot/ui'
import { FolderOpen, KeyRound, Save, Server, ShieldCheck } from 'lucide-react'

export const draftOf = (host: Host): HostDraft => {
  const { updatedAt, ...draft } = host
  return draft
}
export function HostForm({
  host,
  demo,
  onSave,
  onCancel
}: {
  host?: Host
  demo: boolean
  onSave: (draft: HostDraft) => Promise<void>
  onCancel: () => void
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
  const update = <K extends keyof HostDraft>(key: K, value: HostDraft[K]) =>
    setForm((v) => ({ ...v, [key]: value }))
  const field = (key: keyof HostDraft, label: string, input: React.ReactNode, help?: string) => (
    <label className="field">
      <span>{label}</span>
      {input}
      {errors[key] ? <small className="error">{errors[key]}</small> : help && <small>{help}</small>}
    </label>
  )
  return (
    <div className="page-scroll">
      <div className="content-page form-page">
        <div className="eyebrow">
          <Server size={14} /> 主机档案 / {host ? '编辑' : '新建'}
        </div>
        <h1>{host ? `编辑 ${host.name}` : '添加你的第一条连接'}</h1>
        <p className="page-lead">保存连接档案，随时打开终端。无需安装远端 Agent 或 SuRelay。</p>
        <form
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
              return
            }
            setErrors({})
            setBusy(true)
            try {
              await onSave(parsed.data)
            } catch (error) {
              setErrors({ form: String(error) })
            } finally {
              setBusy(false)
            }
          }}
        >
          <section className="form-section">
            <h2>连接目标</h2>
            <div className="form-grid">
              {field(
                'name',
                '主机名称',
                <input
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
                  required
                  value={form.username}
                  onChange={(e) => update('username', e.target.value)}
                />
              )}
              {field(
                'group',
                '分组',
                <input
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
                不会保存密码或私钥口令。首次连接需核对服务器指纹。加密私钥可在交互终端中输入口令；后台诊断需要预先可用的密钥或
                Agent。
              </span>
            </div>
          </section>
          <section className="form-section">
            <h2>整理与备注</h2>
            {field(
              'tags',
              '标签（逗号分隔）',
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="debian, edge"
              />
            )}
            {field(
              'notes',
              '备注',
              <textarea
                rows={3}
                maxLength={4000}
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="记录主机用途。请勿填写密码或令牌。"
              />
            )}
          </section>
          {errors.form && (
            <p className="error" role="alert">
              {errors.form}
            </p>
          )}
          {host && (
            <p className="muted small">档案修改仅用于后续新操作；现有会话与任务保留原连接快照。</p>
          )}
          <div className="form-actions">
            <Button type="button" onClick={onCancel}>
              取消
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              <Save size={15} />
              {busy ? '正在保存…' : demo ? '保存演示档案' : '保存主机'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
