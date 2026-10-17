import test from 'node:test'
import assert from 'node:assert/strict'
import { formatHostIssues, validateHostDraft } from '../../apps/desktop/src/renderer/features/hosts/HostForm'
import { taskResultSummary } from '../../apps/desktop/src/renderer/features/tasks/Tasks'
import { snapshotLoadState } from '../../apps/desktop/src/renderer/app/snapshotState'
import { HostInput, type HostDraft, type Task } from '../../packages/contracts/src'

const draft: HostDraft = {
  name: '',
  address: 'bad address',
  port: 0,
  sshdPort: 0,
  username: 'bad user',
  auth: 'key',
  keyPath: 'relative-key',
  group: '',
  tags: [],
  notes: ''
}

test('round 3.1 host validation follows HostInput limits and context', () => {
  const parseErrors = (value: HostDraft) => {
    const parsed = HostInput.safeParse(value)
    assert.equal(parsed.success, false)
    return validateHostDraft(value).errors
  }
  assert.match(parseErrors({ ...draft, port: 0 }).port, /1–65535.*整数/)
  assert.match(parseErrors({ ...draft, port: 65536 }).port, /1–65535.*整数/)
  assert.match(parseErrors({ ...draft, port: 22.5 }).port, /整数/)
  assert.match(parseErrors({ ...draft, tags: Array.from({ length: 17 }, (_, i) => `tag-${i}`) }).tags, /16 个/)
  assert.match(parseErrors({ ...draft, tags: ['x'.repeat(33)] }).tags, /第 1 个标签.*32 个字符/)
  const valid: HostDraft = {
    ...draft,
    name: 'valid',
    address: 'host.example',
    port: 22,
    sshdPort: null,
    username: '_service',
    auth: 'agent',
    keyPath: ''
  }
  assert.equal(HostInput.safeParse(valid).success, true)
  assert.match(parseErrors({ ...draft, auth: 'key', keyPath: 'relative-key' }).keyPath, /绝对路径/)
  assert.match(parseErrors({ ...draft, keyPath: `bad${String.fromCharCode(10)}key` }).keyPath, /换行.*空字符/)
  const root = formatHostIssues([{ path: [], code: 'custom', message: 'schema root issue' }], { ...draft, auth: 'agent' })
  assert.equal(root.form, 'schema root issue')
  assert.equal(formatHostIssues([{ path: [], code: 'custom', message: 'unknown form issue' }], draft).form, 'unknown form issue')
  for (const [field, max] of Object.entries({ name: 100, address: 253, username: 64, group: 60, keyPath: 1024, notes: 4000 })) {
    assert.match(parseErrors({ ...valid, [field]: 'x'.repeat(max + 1) })[field], new RegExp(`${max} 个字符`))
  }
  assert.match(parseErrors({ ...valid, sshdPort: 65536 }).sshdPort, /1–65535/)
  assert.match(parseErrors({ ...valid, sshdPort: 1.5 }).sshdPort, /整数/)
  for (const control of ['\r', '\n', '\0']) {
    assert.match(parseErrors({ ...valid, keyPath: `C:/key${control}` }).keyPath, /换行或空字符/)
  }
})

test('round 3.1 snapshot load state does not infer facts from an empty initial snapshot', () => {
  assert.equal(snapshotLoadState(true, false), 'loading')
  assert.equal(snapshotLoadState(false, false, 'snapshot rejected'), 'error')
  assert.equal(snapshotLoadState(false, true, 'stale error'), 'ready')
  assert.equal(snapshotLoadState(false, true), 'ready')
})

function task(state: Task['state'], steps: Task['steps'], message?: string): Task {
  return {
    id: `round3-${state}`,
    pluginId: 'diagnostics',
    title: '系统诊断',
    target: {
      id: '00000000-0000-4000-8000-000000000001',
      name: '合成主机',
      address: '192.0.2.10',
      port: 22,
      sshdPort: 22,
      username: 'tester',
      auth: 'agent',
      keyPath: '',
      group: '',
      tags: [],
      notes: '',
      updatedAt: new Date(0).toISOString()
    },
    state,
    createdAt: new Date(0).toISOString(),
    steps,
    message
  }
}

test('round 3 task summary distinguishes every task state and unavailable steps', () => {
  const steps: Task['steps'] = [
    { id: 'ok', title: '系统与内核', state: 'succeeded', output: 'Linux' },
    { id: 'missing', title: '磁盘使用', state: 'unavailable', output: '' },
    { id: 'pending', title: '内存信息', state: 'pending', output: '' }
  ]
  const unavailable = task('succeeded', steps)
  assert.match(taskResultSummary(unavailable).headline, /部分项不可用/)
  assert.equal(taskResultSummary(unavailable).counts.unavailable, 1)
  assert.match(taskResultSummary(unavailable).nextStep, /不代表服务器健康/)

  const expected: Record<Task['state'], RegExp> = {
    running: /正在执行/,
    'cancel-requested': /已请求取消/,
    cancelled: /已取消/,
    failed: /未成功/,
    interrupted: /中断/,
    unknown: /结果未知/,
    succeeded: /部分项不可用/
  }
  for (const [state, pattern] of Object.entries(expected) as [Task['state'], RegExp][]) {
    assert.match(taskResultSummary(task(state, steps, `${state} reason`)).headline, pattern)
    assert.match(taskResultSummary(task(state, steps, `${state} reason`)).detail, /reason/)
  }
})
