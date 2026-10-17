import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { checkPageMatrix, measureContent, assertContent, checkColors } from './page-matrix.mjs'
const root = resolve(import.meta.dirname, '../..')
const requireApp = createRequire(join(root, 'apps/desktop/package.json'))
const { createServer } = await import(pathToFileURL(requireApp.resolve('vite')))
const react = (await import(pathToFileURL(requireApp.resolve('@vitejs/plugin-react')))).default
const tailwind = (await import(pathToFileURL(requireApp.resolve('@tailwindcss/vite')))).default
const baseline = process.argv.includes('--baseline')
const output = join(root, '.local/Test/ui-round3.1', `${baseline ? 'baseline-replay' : 'fixture'}-${Date.now()}`)
await mkdir(output, { recursive: true })
const overrides = new Map()
if (baseline) for (const [path, file] of [
  ['apps/desktop/src/renderer/app/App.tsx', 'App.tsx'],
  ['apps/desktop/src/renderer/features/hosts/HostForm.tsx', 'HostForm.tsx'],
  ['apps/desktop/src/renderer/features/tasks/Tasks.tsx', 'Tasks.tsx'],
  ['apps/desktop/src/renderer/app/style.css', 'style.css']
]) overrides.set(join(root, path).replaceAll('\\', '/'), await readFile(join(root, '.local/Test/ui-round3.1/baseline', file), 'utf8'))
// Baseline replay loads preserved task-start bytes; never checks out or replaces working files.
const server = await createServer({ configFile: false, root,
  plugins: [{ name: 'preserved-baseline', enforce: 'pre', load(id) { return overrides.get(id.split('?')[0]) } }, react(), tailwind()],
  resolve: { alias: { react: dirname(requireApp.resolve('react/package.json')), 'react-dom': dirname(requireApp.resolve('react-dom/package.json')) } },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, logLevel: 'warn'
})
await server.listen()
const url = server.resolvedUrls.local[0]
const report = { source: 'isolated React App + synthetic DesktopAPI, Windows Electron renderer; no Engine/IPC', baseline, output, checks: [], errors: [], pageErrors: [], measurements: {}, pageMatrix: [] }
const target = { id: '00000000-0000-4000-8000-000000000031', name: '四页面合成目标 A', address: '192.0.2.31', port: 22022, sshdPort: null, username: '_service', auth: 'agent', keyPath: '', group: '合成验证', tags: ['fixture'], notes: '合成数据，不连接真实主机。', updatedAt: '2026-10-17T00:00:00.000Z' }
const targetB = { ...target, id: '00000000-0000-4000-8000-000000000032', name: '列表选择 B', address: '192.0.2.32' }
const states = ['running', 'cancel-requested', 'cancelled', 'succeeded', 'failed', 'interrupted', 'unknown']
const headlines = ['正在执行，结果尚未齐全', '已请求取消，等待确认结束', '任务已取消', '只读检查已完成', '任务未成功', '执行中断，结果未完全确认', '结果未知']
const makeTask = (state, i, unavailable = false) => ({ id: `fixture-${unavailable ? 'unavailable' : state}`, pluginId: 'diagnostics', title: '系统诊断', target: { ...target, name: `状态 · ${unavailable ? '部分不可用' : state}`, id: `00000000-0000-4000-8000-${String(i + 50).padStart(12, '0')}` }, state, createdAt: '2026-10-17T00:00:00.000Z', finishedAt: ['running', 'cancel-requested'].includes(state) ? undefined : '2026-10-17T00:00:01.000Z', demo: true,
  steps: [
    { id: 'system', title: '系统与内核', state: state === 'failed' ? 'failed' : 'succeeded', output: '原始输出 <script>window.pwned=true</script>\n' + 'long-column-'.repeat(180), exitCode: state === 'failed' ? 1 : 0 },
    { id: 'uptime', title: '运行时间', state: 'succeeded', output: 'uptime fixture' },
    { id: 'disk', title: '磁盘使用', state: unavailable ? 'unavailable' : state === 'running' ? 'running' : state === 'unknown' ? 'unknown' : 'succeeded', output: '' },
    { id: 'memory', title: '内存信息', state: state === 'cancelled' ? 'pending' : 'succeeded', output: '' }
  ] })
const tasks = states.map((s, i) => makeTask(s, i)); tasks.push(makeTask('succeeded', 9, true))
const base = { hosts: [target, targetB], sessions: [], tasks, plugins: [{ id: 'diagnostics', name: '系统诊断', description: '四项只读检查', version: '0.1.0', readOnly: true }], sshAvailable: true, dataPath: 'isolated synthetic API' }
const env = { ...process.env, SUPILOT_FIXTURE_URL: url + 'tests/e2e/round31-fixture.html' }; delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath: requireApp('electron'), args: [join(root, 'tests/e2e/round31-host.cjs')], env })
const page = await app.firstWindow()
page.setDefaultTimeout(6000)
page.on('pageerror', (e) => { report.pageErrors.push(e.message) })
await page.addInitScript(({ base }) => {
  const scenario = new URLSearchParams(location.search).get('scenario') || 'empty'
  localStorage.clear() // This test-only host has an isolated temporary profile.
  localStorage.setItem('supilot-ui', JSON.stringify({ uiSize: 13, terminalSize: 14, ansi: 'dark-plus' }))
  let data = structuredClone(base), notify = () => {}
  if (['empty', 'reject', 'pending', 'missing', 'engine-error', 'form'].includes(scenario)) { data.hosts = []; data.tasks = [] }
  if (scenario === 'missing') data.sshAvailable = false
  if (scenario === 'engine-error') data.engineError = '合成 Engine 错误'
  if (scenario === 'no-tasks') data.tasks = []
  if (scenario === 'agent-invalid') data.hosts[0].keyPath = 'C:/' + 'x'.repeat(1025)
  window.fixture = { calls: [], data, saveMode: 'success', copied: '', copyMode: 'success',
    publish(next) { data = structuredClone(next); this.data = data; notify(structuredClone(data)) } }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { if (window.fixture.copyMode === 'failure') throw Error('合成剪贴板拒绝'); window.fixture.copied = text } } })
  window.supilot = {
    subscribe(callback) { notify = callback; return () => { notify = () => {} } },
    request(request) {
      const f = window.fixture; f.calls.push(structuredClone(request))
      if (request.type === 'snapshot') {
        if (scenario === 'reject') return Promise.reject(Error('合成首次快照拒绝'))
        if (scenario === 'pending') return new Promise((resolve, reject) => { f.resolve = (value) => resolve(value || data); f.reject = () => reject(Error('较早请求失败')) })
        return Promise.resolve(structuredClone(data))
      }
      if (request.type === 'host.save') {
        const saved = { ...request.host, id: request.host.id || '00000000-0000-4000-8000-000000000099', updatedAt: '2026-10-17T00:00:00.000Z' }
        if (f.saveMode === 'failure') return Promise.reject(Error('合成保存失败'))
        if (f.saveMode === 'pending') return new Promise((resolve, reject) => { f.saveResolve = () => resolve(saved); f.saveReject = () => reject(Error('合成保存失败')) })
        f.publish({ ...data, hosts: [...data.hosts.filter((h) => h.id !== saved.id), saved] }); return Promise.resolve(saved)
      }
      if (request.type === 'trust.inspect') return new Promise((resolve, reject) => { f.trustResolve = resolve; f.trustReject = () => reject(Error('合成条件检查结束')) })
      if (request.type === 'task.cancel') { f.publish({ ...data, tasks: data.tasks.map((t) => t.id === request.id ? { ...t, state: 'cancel-requested' } : t) }); return Promise.resolve(null) }
      return Promise.reject(Error(`Unexpected fixture request ${request.type}`))
    },
    attachTerminal: async () => {}, chooseKey: async () => null
  }
}, { base })
const shot = (name) => page.screenshot({ path: join(output, `${name}.png`) })
async function open(scenario = 'existing', size = [900, 650]) {
  await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setSize(...s), size)
  await page.goto(`${url}tests/e2e/round31-fixture.html?scenario=${scenario}`)
  await page.locator('.welcome').waitFor()
  if (scenario !== 'pending') await page.locator('.welcome-state-loading').waitFor({ state: 'detached' })
}
async function check(name, run) {
  try { await run(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`) }
  catch (e) { report.errors.push({ name, error: e.stack }); report.checks.push({ name, passed: false }); console.log(`FAIL ${name}: ${e.message}`); await shot(`failed-${name}`).catch(() => {}) }
}
const add = async () => { await page.getByRole('button', { name: '添加主机', exact: true }).first().click(); await page.getByLabel('主机名称', { exact: true }).fill('表单合成主机'); await page.getByLabel('主机地址', { exact: true }).fill('192.0.2.99') }
const save = () => page.getByRole('button', { name: '保存主机', exact: true }).click()
const summary = () => page.locator('.form-error-summary')
async function taskSelect(id) {
  const compact = page.getByLabel('选择任务记录')
  if (await compact.isVisible()) await compact.selectOption(id)
  else await page.locator('.history-list > button').nth(tasks.findIndex((t) => t.id === id)).click()
}
try {
  await check('auth-hidden-error', async () => {
    await open('form'); await add(); await page.getByLabel('已有私钥文件').check(); await page.getByLabel('私钥文件路径').fill('relative-key'); await save(); await summary().waitFor(); await shot('form-key-error')
    await page.getByLabel('SSH Agent').check(); await shot('form-agent-after-key-error')
    report.measurements.authSwitch = { keyLinks: await summary().locator('button').filter({ hasText: '私钥文件路径' }).count(), keyFields: await page.getByLabel('私钥文件路径').count() }
    assert.equal(report.measurements.authSwitch.keyLinks, 0)
    assert.equal(await page.getByLabel('主机名称', { exact: true }).inputValue(), '表单合成主机')
    await page.getByLabel('已有私钥文件').check(); assert.equal(await page.getByLabel('私钥文件路径').inputValue(), 'relative-key'); await save(); assert.match(await summary().innerText(), /绝对路径/)
  })
  await check('agent-schema-error-reachable', async () => {
    await open('agent-invalid'); await page.getByLabel('编辑选中主机', { exact: true }).click(); await save(); await summary().waitFor()
    assert.match(await summary().innerText(), /1024/)
    await summary().locator('button').filter({ hasText: '私钥文件路径' }).click()
    const field = page.getByLabel('私钥文件路径'); assert.equal(await field.count(), 1); assert.equal(await field.evaluate((el) => el === document.activeElement), true)
    await field.fill('C:/' + 'x'.repeat(1024)); assert.equal(await field.count(), 1); assert.match(await summary().innerText(), /1024/)
    await field.fill('relative-preserved'); await save(); await page.locator('.form-page').waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => window.fixture.calls.filter((x) => x.type === 'host.save').at(-1).host.keyPath), 'relative-preserved')
  })
  await check('welcome-rejection', async () => {
    await open('reject'); await shot('welcome-rejected')
    report.measurements.rejection = { first: await page.locator('.welcome-entry-first').count(), missing: await page.locator('.welcome').getByText('系统 OpenSSH 不可用', { exact: true }).count() }
    assert.equal(report.measurements.rejection.first, 0); assert.equal(report.measurements.rejection.missing, 0)
    await page.locator('.welcome').getByRole('button', { name: '添加主机', exact: true }).click(); await page.locator('.form-page').waitFor()
    await open('reject'); await page.locator('.welcome').getByRole('button', { name: '探索演示工作区', exact: true }).click(); await page.locator('.demo-mode').waitFor()
  })
  await check('welcome-recovery-and-stale-request', async () => {
    await open('pending'); assert.equal(await page.locator('.welcome-state-loading').count(), 1); assert.equal(await page.locator('.welcome-entry-first').count(), 0); await shot('welcome-loading')
    await page.evaluate((s) => window.fixture.publish(s), base); await page.locator('.welcome-entry-existing').waitFor(); await page.evaluate(() => window.fixture.reject()); await page.waitForTimeout(80)
    assert.equal(await page.locator('.welcome-state-error').count(), 0); assert.equal(await page.locator('.welcome-entry-existing').count(), 1)
    await open('pending'); await page.evaluate((s) => window.fixture.publish(s), base); await page.evaluate(() => window.fixture.resolve({ ...window.fixture.data, hosts: [], sshAvailable: false })); await page.waitForTimeout(80); assert.equal(await page.locator('.welcome-entry-existing').count(), 1)
    await open('reject'); await page.evaluate((s) => window.fixture.publish(s), base); await page.locator('.welcome-entry-existing').waitFor(); assert.equal(await page.locator('.welcome-state-error').count(), 0); assert.equal(await page.getByRole('alert').filter({ hasText: '合成首次快照拒绝' }).count(), 0); await shot('welcome-recovered')
  })
  await check('welcome-entrances', async () => {
    await open('empty'); assert.equal(await page.locator('.welcome-entry-first').count(), 1); await shot('welcome-empty'); await page.locator('.welcome').getByRole('button', { name: '添加主机', exact: true }).click(); await page.locator('.form-page').waitFor()
    await open('missing'); assert.equal(await page.locator('.welcome').getByText('系统 OpenSSH 不可用', { exact: true }).count(), 1); await shot('welcome-openssh-missing'); await page.locator('.welcome').getByRole('button', { name: '探索演示工作区', exact: true }).click(); await page.locator('.demo-mode').waitFor(); assert.match(await page.locator('.status-bar').innerText(), /合成数据/); assert.equal(await page.evaluate(() => window.fixture.calls.some((c) => /session.open|task.run/.test(c.type))), false); await shot('welcome-demo')
    await open('existing'); await page.locator('.welcome').getByRole('button', { name: '快速打开主机', exact: true }).click(); await page.getByRole('combobox', { name: '快速搜索主机' }).waitFor(); assert.ok(await page.getByRole('option').count() >= 2); await page.keyboard.press('Escape'); await page.locator('.welcome-settings').click(); await page.getByLabel('界面字号', { exact: true }).waitFor()
    await open('engine-error'); assert.match(await page.locator('.welcome-state-error').innerText(), /合成 Engine 错误/); assert.equal(await page.locator('.welcome-entry-first').count(), 0); await shot('welcome-engine-error'); await page.locator('.welcome').getByRole('button', { name: '添加主机', exact: true }).click(); await page.locator('.form-page').waitFor()
  })
  await check('welcome-demo-page', async () => {
    await open('empty'); await page.locator('.welcome').getByRole('button', { name: '探索演示工作区', exact: true }).click(); await page.locator('.demo-mode').waitFor()
    const close = page.getByRole('button', { name: /^关闭标签 / })
    while (await close.count()) await close.first().click()
    await page.locator('.demo-mode .welcome').waitFor(); assert.match(await page.locator('.status-bar').innerText(), /合成数据/)
    assert.equal(await page.locator('.welcome-entry-first, .welcome-entry-existing').count(), 0)
    assert.equal(await page.evaluate(() => window.fixture.calls.some((c) => /session.open|session.close|task.run/.test(c.type))), false)
    await shot('welcome-demo-page')
  })
  await check('form-errors-save-and-busy', async () => {
    await open('form', [850, 600]); await add(); await page.getByLabel('界面与终端设置', { exact: true }).click(); await page.getByLabel('界面字号', { exact: true }).fill('17'); await page.getByRole('button', { name: '完成', exact: true }).click()
    await page.getByLabel('主机地址', { exact: true }).fill('bad address'); await page.getByLabel('公网连接端口').fill('65536'); await page.locator('.form-advanced summary').click(); await page.getByLabel('远端 sshd 监听端口（可选）').fill('0'); await page.locator('.form-advanced summary').click(); await save(); await summary().waitFor(); await shot('form-errors'); assert.match(await summary().innerText(), /1–65535/); assert.equal(await page.locator('.form-advanced[open]').count(), 1)
    await page.locator('.form-advanced summary').click(); await summary().locator('button').filter({ hasText: '远端监听端口' }).click(); assert.equal(await page.getByLabel('远端 sshd 监听端口（可选）').evaluate((el) => document.activeElement === el), true)
    const fieldBounds = await page.getByLabel('远端 sshd 监听端口（可选）').evaluate((el) => ({ bottom: el.closest('.field').getBoundingClientRect().bottom, footerTop: document.querySelector('.host-form-actions').getBoundingClientRect().top })); report.measurements.advancedFocus = fieldBounds; assert.ok(fieldBounds.bottom <= fieldBounds.footerTop); await shot('form-advanced-error-focused')
    await page.getByLabel('远端 sshd 监听端口（可选）').fill('22'); await page.getByLabel('主机地址', { exact: true }).fill('192.0.2.99'); await page.getByLabel('公网连接端口').fill('22022'); await page.getByLabel('用户名', { exact: true }).fill('_service')
    await page.getByLabel('标签（逗号分隔）').fill(Array.from({ length: 17 }, (_, i) => 'tag' + i).join(',')); await save(); assert.match(await summary().innerText(), /16/); await page.getByLabel('标签（逗号分隔）').fill('x'.repeat(33)); await save(); assert.match(await summary().innerText(), /32/); await page.getByLabel('标签（逗号分隔）').fill('tag，tag,  second  '); assert.equal(await summary().locator('button').filter({ hasText: '标签' }).count(), 0)
    await page.getByLabel('已有私钥文件').check(); await page.getByLabel('私钥文件路径').fill('C:/' + 'long-key-path-'.repeat(60)); await page.evaluate(() => { window.fixture.saveMode = 'failure' }); await save(); await summary().getByText(/合成保存失败/).waitFor(); assert.equal(await summary().locator('button').count(), 0); await shot('form-save-failure')
    await page.evaluate(() => { window.fixture.saveMode = 'pending' }); await save(); await page.getByRole('button', { name: '正在保存…' }).waitFor(); assert.equal(await page.getByRole('button', { name: '正在保存…' }).isDisabled(), true)
    const before = await page.evaluate(() => window.fixture.calls.filter((c) => c.type === 'host.save').length)
    await page.getByLabel('用户名', { exact: true }).focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => window.fixture.calls.filter((c) => c.type === 'host.save').length), before)
    await page.evaluate(() => window.fixture.saveReject()); await summary().getByText(/合成保存失败/).waitFor(); await page.getByRole('button', { name: '取消', exact: true }).click(); await page.getByRole('heading', { name: '放弃未保存的修改', exact: true }).waitFor(); await page.getByRole('button', { name: '返回', exact: true }).click(); assert.equal(await page.getByLabel('主机名称', { exact: true }).inputValue(), '表单合成主机')
    await page.getByRole('button', { name: '演示模式', exact: true }).click(); await page.getByRole('heading', { name: '放弃修改并切换模式', exact: true }).waitFor(); await page.getByRole('button', { name: '返回', exact: true }).click()
    await page.evaluate(() => { window.fixture.saveMode = 'success' }); await save(); await page.locator('.form-page').waitFor({ state: 'detached' }); assert.deepEqual(await page.evaluate(() => window.fixture.calls.filter((c) => c.type === 'host.save').at(-1).host.tags), ['tag', 'second'])
  })
  await check('diagnostic-target-busy-planned', async () => {
    await open('empty'); await page.locator('.activity-rail [aria-label^="系统诊断"]').click(); assert.equal(await page.getByRole('button', { name: '开始只读诊断', exact: true }).isDisabled(), true); await shot('diagnostic-no-target')
    await open('existing'); await page.locator('.activity-rail [aria-label^="系统诊断"]').click(); assert.equal(await page.locator('.check-row').count(), 4); await shot('diagnostic-default'); await page.locator('.host-row').filter({ hasText: '列表选择 B' }).click(); assert.match(await page.locator('.target-strip').innerText(), /四页面合成目标 A/)
    await page.locator('.execution-details summary').click(); await shot('diagnostic-expanded'); assert.match(await page.locator('.execution-details').innerText(), /20 秒.*128/)
    await page.getByRole('button', { name: '开始只读诊断', exact: true }).click(); await page.getByRole('button', { name: '检查连接条件…', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: '检查连接条件…', exact: true }).isDisabled(), true); assert.equal(await page.evaluate(() => window.fixture.calls.filter((c) => c.type === 'task.run').length), 0); await shot('diagnostic-busy'); await page.evaluate(() => window.fixture.trustReject())
    await open('existing', [1440, 900]); await page.locator('.detail-fold summary').filter({ hasText: '扩展能力' }).click()
    for (const plugin of ['SuRelay', 'Access']) { await page.getByRole('button', { name: plugin, exact: true }).click(); const panel = page.locator('.tab-content:not([hidden])'); assert.match(await panel.innerText(), /规划中/); assert.equal(await panel.getByRole('button', { name: '后续版本提供' }).isDisabled(), true); assert.equal(await panel.locator('button:enabled').count(), 0); await shot(`planned-${plugin}`) }
  })
  await check('tasks-states-and-warning', async () => {
    await open('existing', [1440, 900]); await page.locator('.activity-rail [aria-label="任务记录"]').click()
    report.measurements.states = []
    for (const [i, state] of states.entries()) {
      await taskSelect(`fixture-${state}`); assert.match(await page.locator('.result-message').innerText(), new RegExp(headlines[i])); assert.equal(await page.locator('.task-detail > .page-heading .status').getAttribute('class').then((s) => s.includes(`status-${state}`)), true)
      const colors = await page.locator('.result-message').evaluate((el) => ({ border: getComputedStyle(el).borderLeftColor, icon: getComputedStyle(el.querySelector('svg')).color })); report.measurements.states.push({ state, ...colors }); await shot(`task-${state}`)
      const expected = { running: 'rgb(122, 162, 247)', 'cancel-requested': 'rgb(231, 189, 114)', cancelled: 'rgb(141, 151, 168)', succeeded: 'rgb(124, 203, 155)', failed: 'rgb(240, 138, 138)', interrupted: 'rgb(240, 138, 138)', unknown: 'rgb(231, 189, 114)' }[state]
      assert.equal(colors.border, state === 'running' ? 'rgb(37, 99, 235)' : expected); assert.equal(colors.icon, expected)
      if (state === 'cancel-requested') assert.equal(await page.getByRole('button', { name: '请求取消', exact: true }).isDisabled(), true)
    }
    await taskSelect('fixture-unavailable'); const m = await page.locator('.result-message').evaluate((el) => ({ border: getComputedStyle(el).borderLeftColor, icon: getComputedStyle(el.querySelector('svg')).color, text: el.textContent })); report.measurements.unavailable = m; await shot('task-unavailable'); assert.equal(m.border, 'rgb(231, 189, 114)'); assert.equal(m.icon, 'rgb(231, 189, 114)'); assert.match(m.text, /不代表服务器健康/); assert.match(await page.locator('.task-meta').innerText(), /成功 3 \/ 共 4.*不可用 1/s)
  })
  await check('tasks-logs-copy-cancel-filters', async () => {
    await open('existing', [1440, 900]); await page.locator('.activity-rail [aria-label="任务记录"]').click()
    await taskSelect('fixture-running'); assert.equal(await page.getByLabel('只读诊断日志').innerText(), '正在等待 SSH 返回结果…'); await page.getByRole('button', { name: '请求取消', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.result-message')?.textContent.includes('已请求取消')); assert.equal(await page.getByRole('button', { name: '请求取消', exact: true }).isDisabled(), true)
    await taskSelect('fixture-succeeded'); const log = page.getByLabel('只读诊断日志'); assert.equal(await log.evaluate((el) => getComputedStyle(el).whiteSpace), 'pre'); assert.ok(await log.evaluate((el) => el.scrollWidth > el.clientWidth)); assert.equal(await page.evaluate(() => window.pwned), undefined)
    await page.getByRole('button', { name: '自动换行', exact: true }).click(); assert.equal(await log.evaluate((el) => getComputedStyle(el).whiteSpace), 'pre-wrap'); await shot('task-log-wrap')
    await page.getByRole('button', { name: '复制完整日志', exact: true }).click(); await page.getByRole('button', { name: '已复制日志', exact: true }).waitFor(); const copied = await page.evaluate(() => window.fixture.copied); for (const word of ['系统与内核', '运行时间', '磁盘使用', '内存信息', '无输出', 'long-column-']) assert.ok(copied.includes(word))
    await page.evaluate(() => { window.fixture.copyMode = 'failure' }); await page.getByRole('button', { name: '已复制日志', exact: true }).click(); await page.getByRole('alert').filter({ hasText: '复制失败' }).waitFor(); await shot('task-copy-failure')
    await page.locator('.steps-nav button').filter({ hasText: '内存信息' }).click(); assert.match(await log.innerText(), /没有收到输出/)
    await page.evaluate(() => window.fixture.publish({ ...window.fixture.data, tasks: window.fixture.data.tasks.map((t) => ({ ...t, message: '刷新后的实际说明' })) })); assert.match(await page.locator('.log-panel header strong').innerText(), /内存信息/)
    await taskSelect('fixture-cancelled'); await page.locator('.steps-nav button').filter({ hasText: '内存信息' }).click(); assert.match(await log.innerText(), /尚未执行/)
    await page.getByLabel('搜索任务主机').fill('no-match'); await page.getByRole('heading', { name: '没有匹配的记录' }).waitFor(); assert.equal(await page.locator('.task-detail').count(), 0); assert.equal(await page.locator('.detail-identity').count(), 0); await shot('task-filter-empty')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(850, 600)); await page.locator('.compact-search-chip').waitFor({ state: 'visible' }); await page.getByRole('button', { name: '显示全部任务' }).click(); await page.locator('.task-detail').waitFor(); await shot('task-compact-filter-restored')
    await open('no-tasks'); await page.locator('.activity-rail [aria-label="任务记录"]').click(); await page.getByRole('heading', { name: '还没有诊断记录' }).waitFor(); await shot('task-no-records')
  })
  for (const name of ['welcome', 'form', 'diagnostic', 'tasks']) await check(`matrix-${name}`, async () => {
    await open('existing')
    if (name === 'form') await page.getByRole('button', { name: '添加主机', exact: true }).first().click()
    if (name === 'diagnostic') await page.locator('.activity-rail [aria-label^="系统诊断"]').click()
    if (name === 'tasks') await page.locator('.activity-rail [aria-label="任务记录"]').click()
    // Keep the real drawer expanded to exercise less vertical space, then restore.
    await page.locator('.task-drawer > header > button').first().click()
    await checkPageMatrix({ page, app, output, report }, name)
  })
} finally {
  await writeFile(join(output, 'ui-round31-validation.json'), JSON.stringify(report, null, 2))
  await app.close().catch(() => {}); await server.close()
  console.log(JSON.stringify({ output, checks: report.checks, errors: report.errors, pageErrors: report.pageErrors, matrixRows: report.pageMatrix.length }, null, 2))
  if (report.errors.length || report.pageErrors.length) process.exitCode = 1
}
