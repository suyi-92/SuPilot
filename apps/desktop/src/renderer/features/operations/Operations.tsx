import type { Host } from '@supilot/contracts'
import { Button } from '@supilot/ui'
import {
  Activity,
  ArrowRight,
  Clock3,
  Cpu,
  HardDrive,
  Info,
  Layers3,
  Play,
  Shield,
  ShieldCheck,
  TerminalSquare
} from 'lucide-react'
import { endpoint } from '../../app/format'

export function Operations({
  host,
  demo,
  busy,
  onRun,
  plugin = 'diagnostics'
}: {
  host?: Host
  demo: boolean
  busy: boolean
  onRun: () => void
  plugin?: string
}) {
  const available = plugin === 'diagnostics'
  return (
    <div className="page-scroll">
      <div className="content-page operation-page">
        <div className="eyebrow">
          <Layers3 size={14} /> 内置操作 /{' '}
          {available ? 'Diagnostics' : plugin === 'surelay' ? 'SuRelay' : 'Access'}
        </div>
        <div className="page-heading">
          <div>
            <h1>
              {available
                ? '系统诊断'
                : plugin === 'surelay'
                  ? 'SuRelay 服务管理'
                  : 'SSH 接入与访问保护'}
            </h1>
            <p className="page-lead">
              {available
                ? '检查系统、运行时间、磁盘与内存，结果保存到任务记录。'
                : '已保留扩展入口，v0.1 尚未实现远端修改能力。'}
            </p>
          </div>
          <span className={`capability ${available ? '' : 'planned'}`}>
            {available ? <ShieldCheck size={14} /> : <Clock3 size={14} />}
            {available ? '只读操作' : '规划中'}
          </span>
        </div>
        <div className="target-strip">
          <TerminalSquare size={20} />
          <div>
            <span className="overline">固定检查目标 · 不随列表选择变化</span>
            <strong>{host?.name || '尚未选择主机'}</strong>
          </div>
          <div className="target-endpoint">
            {host ? <code>{endpoint(host)}</code> : '请从主机详情打开操作'}
            {demo && <span className="demo-label">演示数据 · 不连接主机</span>}
          </div>
        </div>
        {available ? (
          <>
            <section className="operation-scope" aria-labelledby="diagnostic-scope-title">
              <div className="section-heading">
                <h2 id="diagnostic-scope-title">检查范围</h2>
                <span>固定四项 · 不可单独选择</span>
              </div>
              <p className="section-lead">本次只读取系统与内核、运行时间、磁盘使用和内存信息。</p>
            </section>
            <div className="check-list">
              {[
                [Cpu, '系统与内核', '发行版、内核版本与处理器架构'],
                [Clock3, '运行时间', '开机时间与系统负载'],
                [HardDrive, '磁盘使用', '挂载点、容量与可用空间'],
                [Activity, '内存信息', '总内存、可用内存与交换空间']
              ].map(([Icon, title, description], i) => {
                const Glyph = Icon as typeof Cpu
                return (
                  <div className="check-row" key={String(title)}>
                    <span className="step-number">0{i + 1}</span>
                    <Glyph size={19} />
                    <div>
                      <strong>{String(title)}</strong>
                      <p>{String(description)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="operation-notes">
              <div>
                <ShieldCheck size={18} />
                <div>
                  <strong>独立执行，不影响终端输入</strong>
                  <p>四项只读查询，不向当前终端输入命令，也不修改远端配置。</p>
                </div>
              </div>
              <div>
                <Info size={18} />
                <div>
                  <strong>认证需要提前就绪</strong>
                  <p>使用已有密钥或 SSH Agent，后台不等待密码或口令。</p>
                </div>
              </div>
            </div>
            <details className="execution-details">
              <summary>技术细节与执行限制</summary>
              <div className="execution-detail-grid">
                <div>
                  <strong>实际命令</strong>
                  <code>/etc/os-release · uname · uptime · /proc/uptime · df -Pk · /proc/meminfo · free</code>
                </div>
                <div>
                  <strong>执行约束</strong>
                  <p>每项通过独立 SSH 连接执行，单项超时 20 秒，输出最多 128 KiB。缺少工具时标记为不可用；连接中断或结果不完整会明确记录，不推断执行成功。</p>
                </div>
              </div>
            </details>
            <div className="operation-footer">
              <span className="muted">
                {host ? '只读结果自动保存到任务记录' : '请先选择主机，再从详情中打开诊断'}
              </span>
              <Button variant="primary" disabled={!host || busy} onClick={onRun}>
                <Play size={15} />
                {busy ? '检查连接条件…' : demo ? '运行演示诊断' : '开始只读诊断'}
                <ArrowRight size={15} />
              </Button>
            </div>
          </>
        ) : (
          <div className="planned-panel">
            <Shield size={36} />
            <h2>{plugin === 'surelay' ? '服务插件将保持可选' : '访问变更需要完整保护流程'}</h2>
            <p>
              {plugin === 'surelay'
                ? '未来在此探测与管理 SuRelay。未安装 SuRelay 的主机依然可以使用全部终端与诊断功能。'
                : '未来支持公钥接入与 SSH 加固；实施前需保留旧通道、验证独立新连接，再收紧访问路径。'}
            </p>
            <p>当前版本没有安装、配置修改、防火墙调整或卸载操作，不会对服务器执行任何修改。</p>
            <Button disabled>后续版本提供</Button>
          </div>
        )}
      </div>
    </div>
  )
}
