import { randomUUID } from 'node:crypto'
import type { Host, Task } from '@supilot/contracts'
import type { DiagnosticPlugin } from '@supilot/plugin-sdk'
import { Store } from '../storage'
import { OpenSSH } from '../ssh'

export class Tasks {
  private jobs = new Map<string, { task: Task; abort: AbortController; done: Promise<void> }>()
  constructor(
    private store: Store,
    private ssh: OpenSSH,
    private changed: () => void
  ) {}
  start(target: Host, plugin: DiagnosticPlugin): Task {
    if ([...this.jobs.values()].some((j) => j.task.target.id === target.id))
      throw new Error('该主机已有诊断任务正在运行。请等待完成或请求取消。')
    if (this.jobs.size >= 4) throw new Error('当前有 4 个诊断任务，请等待其中一个完成。')
    const task: Task = {
      id: randomUUID(),
      pluginId: plugin.id,
      title: plugin.name,
      target: structuredClone(target),
      state: 'running',
      createdAt: new Date().toISOString(),
      steps: plugin.checks.map((c) => ({ id: c.id, title: c.title, state: 'pending', output: '' }))
    }
    const abort = new AbortController()
    this.store.prune()
    this.store.saveTask(task)
    const job = { task, abort, done: Promise.resolve() }
    this.jobs.set(task.id, job)
    job.done = this.execute(task, plugin, abort.signal).finally(() => {
      this.jobs.delete(task.id)
      this.changed()
    })
    this.changed()
    return task
  }
  private async execute(task: Task, plugin: DiagnosticPlugin, signal: AbortSignal) {
    try {
      for (let i = 0; i < plugin.checks.length; i++) {
        if (signal.aborted) {
          task.state = 'cancelled'
          task.message = '已取消尚未发出的检查。'
          break
        }
        const step = task.steps[i]
        step.state = 'running'
        this.store.saveTask(task)
        this.changed()
        const result = await this.ssh.execute(task.target, plugin.checks[i].command, signal)
        step.output = [result.stdout, result.stderr]
          .filter(Boolean)
          .join('\n')
          .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
          .replace(/\x00/g, '')
        step.exitCode = result.code
        if (result.reason) {
          step.state = result.reason === 'spawn' ? 'failed' : 'unknown'
          task.state = result.reason === 'spawn' ? 'failed' : 'unknown'
          task.message =
            result.reason === 'cancel'
              ? '取消请求已发送，本地 SSH 已结束，无法确认远端检查是否完成。'
              : result.reason === 'limit'
                ? '输出超过 128 KiB 上限，已终止本地执行；远端结果未知。'
                : result.reason === 'timeout'
                  ? '检查超过 20 秒，已终止本地执行；远端结果未知。'
                  : '无法启动 OpenSSH。请检查系统安装。'
          break
        }
        if (result.code === 255) {
          const auth = /Permission denied|authentication|sign_and_send_pubkey/i.test(result.stderr)
          const trust = /HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i.test(
            result.stderr
          )
          const connection = /Connection refused|Could not resolve|No route|timed out/i.test(
            result.stderr
          )
          task.state = auth || trust || connection ? 'failed' : 'interrupted'
          step.state = task.state === 'interrupted' ? 'unknown' : 'failed'
          task.message = auth
            ? '免交互认证不可用。请将密钥加载到 SSH Agent，或选择无需口令的现有专用测试密钥，再手动重试。不会等待密码输入。'
            : trust
              ? '主机指纹校验失败，已阻止执行。请核实服务器身份。'
              : connection
                ? '未能建立 SSH 连接，请检查地址、公网端口和网络。'
                : 'SSH 连接中断，该步骤的远端结果未知；不会自动重试。'
          break
        }
        step.state =
          result.code === 0 ? 'succeeded' : result.code === 127 ? 'unavailable' : 'failed'
        this.store.saveTask(task)
        this.changed()
      }
      if (task.state === 'running') {
        task.state = task.steps.some((s) => s.state === 'failed') ? 'failed' : 'succeeded'
        task.message = task.steps.some((s) => s.state === 'unavailable')
          ? '检查完成，部分命令在该系统上不可用；请查看步骤详情。'
          : task.state === 'succeeded'
            ? '只读检查已完成，结果仅反映本次检查时间。'
            : '部分检查执行失败，请查看步骤退出码与输出。'
      }
    } catch (error) {
      task.state = 'failed'
      task.message = error instanceof Error ? error.message : String(error)
      const step = task.steps.find((s) => s.state === 'running')
      if (step) step.state = 'failed'
    } finally {
      task.finishedAt = new Date().toISOString()
      this.store.saveTask(task)
    }
  }
  cancel(id: string) {
    const job = this.jobs.get(id)
    if (!job) return
    job.task.state = 'cancel-requested'
    job.task.message = '正在请求取消本地执行，尚未确认远端结果。'
    this.store.saveTask(job.task)
    this.changed()
    job.abort.abort()
  }
  async shutdown() {
    for (const id of this.jobs.keys()) this.cancel(id)
    await Promise.all([...this.jobs.values()].map((j) => j.done))
  }
}
