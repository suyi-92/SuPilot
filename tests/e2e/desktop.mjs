import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createSSHFixture } from '../fixtures/ssh-server.mjs'
const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../..')
const output = join(root, '.local/Test')
await mkdir(output, { recursive: true })
const packaged = process.argv.includes('--packaged')
const executablePath = packaged
  ? join(root, 'release/win-unpacked/SuPilot.exe')
  : require(join(root, 'apps/desktop/node_modules/electron'))
const testEnv = { ...process.env, SUPILOT_TEST: '1' }
delete testEnv.ELECTRON_RUN_AS_NODE
const options = {
  executablePath,
  args: packaged ? [] : [join(root, 'apps/desktop')],
  env: testEnv,
  timeout: 30000
}
const report = { packaged, checks: [], errors: [] }
let app
let fixture
let loopId
let clipboardBefore
async function waitSnapshot(page, predicate) {
  const start = Date.now()
  while (Date.now() - start < 25000) {
    const snapshot = await page.evaluate(() => window.supilot.request({ type: 'snapshot' }))
    if (predicate(snapshot)) return snapshot
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Engine snapshot condition timed out')
}
async function captureWindow(filename) {
  // Electron zoom changes CDP screenshot scaling; capture the full native viewport.
  const png = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  await writeFile(join(output, filename), Buffer.from(png, 'base64'))
}
async function launch() {
  app = await electron.launch(options)
  app.process().stderr.on('data', (d) => {
    const text = d.toString()
    if (!/ExperimentalWarning|trace-warnings|DevTools listening/.test(text))
      process.stderr.write(text)
  })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => report.errors.push(error.message))
  await page.waitForFunction(() => !!window.supilot)
  await page.waitForFunction(() => !document.body.textContent.includes('正在加载本机工作区'))
  return page
}
try {
  let page = await launch()
  // Keep visual checks reproducible without changing the user's production profile.
  await page.getByLabel('界面与终端设置', { exact: true }).click()
  await page.getByLabel('界面字号', { exact: true }).fill('13')
  await page.getByLabel('终端字号', { exact: true }).fill('14')
  await page.getByLabel('终端 ANSI 配色').selectOption('dark-plus')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.screenshot({ path: join(output, 'welcome.png') })
  const initial = await page.evaluate(() => window.supilot.request({ type: 'snapshot' }))
  assert.match(initial.dataPath, /SuPilot-test$/)
  assert.equal(initial.engineError, undefined)
  const localHost = initial.hosts.find((host) => host.local)
  assert.ok(localHost, 'Local host profile is discovered on first launch')
  assert.equal(localHost.address, '127.0.0.1')
  assert.equal(initial.sessions.length, 0, 'Local discovery does not open a session')
  report.checks.push(
    'Engine utilityProcess starts; test profile is isolated; SQLite snapshot loads'
  )
  const malformed = await page.evaluate(async () => {
    try {
      await window.supilot.request({ type: 'host.save', host: { address: '-oProxyCommand=bad' } })
      return false
    } catch {
      return true
    }
  })
  assert.equal(malformed, true)
  report.checks.push('Malformed renderer request rejected by runtime schema')
  const unauthorized = await app.evaluate(async ({ BrowserWindow }) => {
    const other = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    })
    try {
      await other.loadURL('data:text/html,<title>IPC test</title>')
      return await other.webContents.executeJavaScript(
        "require('electron').ipcRenderer.invoke('supilot:request', {type:'snapshot'}).then(() => false, () => true)"
      )
    } finally {
      other.destroy()
    }
  })
  assert.equal(unauthorized, true)
  report.checks.push(
    'IPC request from a second BrowserWindow rejected even with the same operation'
  )
  const name = `本地持久化验证-${Date.now()}`
  await page.getByRole('button', { name: '添加主机', exact: true }).first().click()
  assert.equal(
    await page.getByRole('button', { name: '保存主机', exact: true }).evaluate((el) => {
      const box = el.getBoundingClientRect()
      return box.top >= 0 && box.bottom <= innerHeight
    }),
    true,
    'Save action is visible without scrolling'
  )
  await page.getByRole('button', { name: '保存主机', exact: true }).click()
  await page.waitForFunction(() => document.activeElement?.classList.contains('form-error-summary'))
  await page.locator('.form-error-summary button').filter({ hasText: '主机地址' }).click()
  assert.equal(
    await page
      .getByLabel('主机地址', { exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  )
  await page.screenshot({ path: join(output, 'host-form-error.png') })
  await page.getByLabel('主机名称', { exact: true }).fill(name)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('heading', { name: '放弃未保存的修改', exact: true }).waitFor()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  assert.equal(await page.getByLabel('主机名称', { exact: true }).inputValue(), name)
  await page.getByRole('button', { name: '演示模式', exact: true }).click()
  await page.getByRole('heading', { name: '放弃修改并切换模式', exact: true }).waitFor()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByLabel('主机地址', { exact: true }).fill('192.0.2.250')
  await page.getByLabel('公网连接端口').fill('22022')
  await page.getByLabel('远端 sshd 监听端口（可选）').fill('22')
  await page.getByLabel('分组', { exact: true }).fill('E2E 合成数据')
  await page.screenshot({ path: join(output, 'host-form.png') })
  await page.getByRole('button', { name: '保存主机', exact: true }).click()
  await page.waitForFunction(
    (name) => document.querySelector('.host-list')?.textContent.includes(name),
    name
  )
  let host = (await page.evaluate(() => window.supilot.request({ type: 'snapshot' }))).hosts.find(
    (h) => h.name === name
  )
  assert.equal(host.port, 22022)
  assert.equal(host.sshdPort, 22)
  await app.close()
  page = await launch()
  host = (await page.evaluate(() => window.supilot.request({ type: 'snapshot' }))).hosts.find(
    (h) => h.id === host.id
  )
  assert.equal(host.name, name)
  report.checks.push(
    'Host added through form, NAT port fields distinct, persisted across application restart'
  )
  report.checks.push(
    'Sticky save action; invalid form focuses error summary and field links; close and mode-switch preserve unsaved edits when dismissed'
  )
  await page.getByRole('button', { name: '演示模式', exact: true }).click()
  await page.waitForSelector('.terminal-pane .xterm-screen')
  assert.equal(await page.locator('.terminal-pane').count(), 2)
  await page.getByRole('button', { name: '快速打开主机', exact: true }).click()
  assert.equal(
    await page
      .getByRole('combobox', { name: '快速搜索主机' })
      .evaluate((el) => document.activeElement === el),
    true
  )
  await page.getByRole('combobox', { name: '快速搜索主机' }).fill('alpine')
  assert.equal(await page.getByRole('option').count(), 1)
  await page.screenshot({ path: join(output, 'quick-open.png') })
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.terminal-pane').count(), 2)
  await page.getByRole('button', { name: '快速打开主机', exact: true }).click()
  await page.getByRole('combobox', { name: '快速搜索主机' }).fill('东京 · 边缘节点 01')
  await page.keyboard.press('Enter')
  assert.equal(
    await page.locator('.terminal-pane').count(),
    2,
    'Quick open reuses an existing session'
  )
  await page.getByLabel('搜索主机', { exact: true }).fill('alpine')
  assert.equal(await page.locator('.host-row').count(), 1)
  await page.getByRole('button', { name: '清除搜索', exact: true }).click()
  assert.equal(await page.locator('.host-row').count(), 14)
  await page.locator('.host-row').filter({ hasText: '北京' }).click()
  assert.match(await page.locator('.host-selection strong').innerText(), /北京/)
  assert.match(await page.locator('.detail-identity h3').innerText(), /东京/)
  await page.locator('.host-row').filter({ hasText: '东京 · 边缘节点 01' }).click()
  assert.equal(
    await page
      .locator('.drawer-task')
      .first()
      .evaluate((el) => getComputedStyle(el).display),
    'grid'
  )
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(output, 'workspace.png') })
  const before = await page.evaluate(() => window.supilot.request({ type: 'snapshot' }))
  assert.equal(before.sessions.length, 0)
  await page.getByRole('button', { name: '上下分屏', exact: true }).click()
  await page.getByRole('button', { name: '左右分屏', exact: true }).click()
  await page.getByRole('button', { name: '系统诊断', exact: true }).first().click()
  await page.getByRole('heading', { name: '系统诊断', exact: true }).waitFor()
  await page.screenshot({ path: join(output, 'operation.png') })
  await page.getByRole('button', { name: '运行演示诊断', exact: true }).click()
  await page.locator('.task-detail').waitFor()
  await page.screenshot({ path: join(output, 'tasks.png') })
  await page.getByLabel('筛选任务').filter({ visible: true }).selectOption('attention')
  await page.waitForFunction(() =>
    document.querySelector('.result-message')?.textContent.includes('SSH Agent')
  )
  assert.match(await page.locator('.detail-identity h3').innerText(), /香港/)
  await page.screenshot({ path: join(output, 'task-failed.png') })
  await page.getByRole('button', { name: '自动换行', exact: true }).click()
  assert.equal(
    await page.getByLabel('只读诊断日志').evaluate((el) => getComputedStyle(el).whiteSpace),
    'pre-wrap'
  )
  await page.getByLabel('搜索任务主机').fill('no-such-host')
  await page.getByRole('heading', { name: '没有匹配的记录', exact: true }).waitFor()
  assert.equal(await page.locator('.task-detail').count(), 0)
  await page.getByRole('button', { name: '显示全部任务', exact: true }).click()
  await page.getByLabel('筛选任务').filter({ visible: true }).selectOption('attention')
  await page.getByRole('tab', { name: '系统诊断', exact: true }).click()
  await page.getByRole('button', { name: '运行演示诊断', exact: true }).click()
  assert.equal(await page.getByLabel('筛选任务').filter({ visible: true }).inputValue(), 'all')
  assert.match(await page.locator('.result-message').innerText(), /已完成/)
  report.checks.push(
    'Task filters keep result and inspector synchronized; empty results clear detail; explicit navigation resets stale filters; logs preserve columns and optionally wrap'
  )
  await page.locator('.session-row').filter({ hasText: '东京 / 新加坡' }).click()
  assert.equal(
    await page.getByRole('tab', { name: /东京 \/ 新加坡/ }).getAttribute('aria-selected'),
    'true'
  )
  assert.equal(await page.locator('.terminal-pane').count(), 2)
  assert.equal(
    (await page.evaluate(() => window.supilot.request({ type: 'snapshot' }))).tasks.length,
    before.tasks.length
  )
  report.checks.push(
    'Demo has 14 hosts, two preserved terminal panes, operation and task tabs; no real sessions/tasks created'
  )
  report.checks.push(
    'Quick-open search and Enter reuse, Escape dismissal; sidebar tag filtering; selection preserves active target; open-session navigator restores its tab; task rows use aligned columns'
  )
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650))
  await page.waitForTimeout(250) // Allow ResizeObserver, xterm fit and font metrics to settle.
  assert.equal(await page.locator('.details-sidebar').isVisible(), false)
  await page.screenshot({ path: join(output, 'workspace-small.png') })
  await page.getByRole('button', { name: '展开详情', exact: true }).click()
  await page.getByRole('dialog', { name: '主机详情', exact: true }).waitFor()
  assert.equal(
    await page
      .getByRole('button', { name: '关闭详情栏', exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  )
  await page.keyboard.press('Shift+Tab')
  assert.equal(
    await page.evaluate(() => !!document.activeElement?.closest('.details-sidebar')),
    true
  )
  await page.screenshot({ path: join(output, 'details-small.png') })
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog', { name: '主机详情', exact: true }).count(), 0)
  await page.getByRole('tab', { name: '任务记录', exact: true }).click()
  await page.getByLabel('选择任务记录').waitFor({ state: 'visible' })
  await page.getByLabel('筛选任务').filter({ visible: true }).selectOption('attention')
  await page.screenshot({ path: join(output, 'tasks-small.png') })
  const taskTab = page.getByRole('tab', { name: '任务记录', exact: true })
  await taskTab.focus()
  await page.keyboard.press('ArrowLeft')
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('role') === 'tab' &&
      document.activeElement?.textContent.includes('系统诊断')
  )
  await page.getByRole('tab', { name: /东京 \/ 新加坡/ }).click()
  await page.getByRole('button', { name: '添加主机', exact: true }).first().click()
  assert.equal(
    await page
      .getByRole('button', { name: '保存演示档案', exact: true })
      .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
    true
  )
  await page.screenshot({ path: join(output, 'host-form-small.png') })
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('tab', { name: /东京 \/ 新加坡/ }).click()
  report.checks.push(
    'Narrow detail overlay has focus containment and Escape dismissal; compact task selector and sticky form actions remain usable; work tabs support arrow navigation'
  )
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setSize(1440, 940)
    w.webContents.setZoomFactor(1.5)
  })
  await page.waitForTimeout(250)
  await captureWindow('workspace-150.png')
  const zoomLayout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth
  }))
  assert.ok(zoomLayout.scroll <= zoomLayout.width, '150% zoom has no horizontal page overflow')
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25)
  )
  await page.waitForTimeout(250)
  await captureWindow('workspace-125.png')
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)
  )
  report.checks.push(
    '900 × 650 layout and Chromium 125% / 150% zoom captured; details collapse first'
  )
  const native = await app.evaluate(
    async ({ app, utilityProcess }, worker) => {
      return new Promise((resolve, reject) => {
        const child = utilityProcess.fork(worker, [app.getAppPath(), app.getPath('userData')], {
          stdio: 'pipe',
          serviceName: 'SuPilot Native Verification'
        })
        let errors = ''
        child.stderr.on('data', (d) => (errors += d.toString()))
        const timer = setTimeout(() => {
          child.kill()
          reject(new Error('Native worker timeout: ' + errors))
        }, 25000)
        child.on('message', (result) => {
          clearTimeout(timer)
          resolve(result)
        })
        child.on('exit', (code) => {
          if (code) {
            clearTimeout(timer)
            reject(new Error('Native worker failed: ' + errors))
          }
        })
      })
    },
    join(root, 'tests/e2e/native-worker.cjs')
  )
  await writeFile(join(output, 'native-result.json'), JSON.stringify(native, null, 2))
  assert.equal(native.passed, true)
  report.checks.push(
    'Actual app node-pty loaded in utilityProcess; ConPTY input/output, resize, Unicode and 11,000-character paste; SQLite loaded and queried'
  )
  await page.getByRole('button', { name: '退出演示', exact: true }).click()
  await page.evaluate((id) => window.supilot.request({ type: 'host.delete', id }), host.id)
  assert.equal(
    (await page.evaluate(() => window.supilot.request({ type: 'snapshot' }))).hosts.some(
      (h) => h.id === host.id
    ),
    false
  )
  report.checks.push('Delete host persists via Engine; demo changes do not alter real hosts')
  fixture = await createSSHFixture()
  const loopHost = await page.evaluate(
    ({ port, login }) =>
      window.supilot.request({
        type: 'host.save',
        host: {
          name: '本机 SSH 回归 · 非 VPS',
          address: '127.0.0.1',
          port,
          sshdPort: null,
          username: 'tester',
          auth: 'key',
          keyPath: login,
          group: '隔离验证',
          tags: ['loopback'],
          notes: '仅测试合成 SSH 服务；不执行真实远端命令。'
        }
      }),
    { port: fixture.port, login: fixture.login }
  )
  loopId = loopHost.id
  await page.locator(`.host-row[title*="127.0.0.1:${fixture.port}"]`).dblclick()
  await page.getByRole('heading', { name: '核对服务器身份' }).waitFor()
  await page.getByRole('button', { name: '已独立核对，信任并继续' }).click()
  await waitSnapshot(page, (snapshot) => snapshot.sessions.some((s) => s.state === 'authenticated'))
  await page.waitForFunction(() =>
    document.querySelector('.xterm-rows')?.textContent.includes('LOOPBACK SSH FIXTURE')
  )
  const terminal = page.locator('.xterm-helper-textarea').first()
  await terminal.focus()
  await page.keyboard.insertText('中文端到端输入')
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+r')
  await page.keyboard.press('Control+d')
  await new Promise((resolve) => setTimeout(resolve, 250))
  assert.ok(fixture.state.input.includes('中文端到端输入'))
  for (const char of ['\x03', '\x12', '\x04'])
    assert.ok(
      fixture.state.input.includes(char),
      `Shell control byte ${char.charCodeAt(0)} delivered`
    )
  clipboardBefore = await app.evaluate(({ clipboard }) => clipboard.readText())
  const paste = 'PASTE_START_' + '中文粘贴-data-'.repeat(1100) + '_PASTE_END'
  await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), paste)
  await page.getByRole('button', { name: '粘贴 · Ctrl+Shift+V', exact: true }).click()
  for (let attempt = 0; attempt < 200 && !fixture.state.input.includes('_PASTE_END'); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.ok(
    fixture.state.input.includes(paste),
    'Clipboard paste passed through actual xterm channel'
  )
  await terminal.focus()
  await page.keyboard.insertText('fullscreen')
  await page.waitForFunction(() =>
    document.querySelector('.xterm-rows')?.textContent.includes('FULL SCREEN FIXTURE')
  )
  await page.screenshot({ path: join(output, 'terminal-fullscreen.png') })
  await page.keyboard.insertText('leave-screen')
  for (let attempt = 0; attempt < 100 && !fixture.state.input.includes('leave-screen'); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.ok(fixture.state.input.includes('leave-screen'))
  const previousInput = fixture.state.input
  await page.getByRole('button', { name: '系统诊断', exact: true }).first().click()
  await page.getByRole('button', { name: '开始只读诊断', exact: true }).click()
  await waitSnapshot(page, (snapshot) =>
    snapshot.tasks.some((t) => t.target.id === loopHost.id && t.state === 'succeeded')
  )
  await page.getByRole('button', { name: '复制完整日志', exact: true }).click()
  await page.getByRole('button', { name: '已复制日志', exact: true }).waitFor()
  assert.ok((await app.evaluate(({ clipboard }) => clipboard.readText())).includes('系统诊断'))
  assert.equal(fixture.state.execs, 4)
  assert.equal(fixture.state.input, previousInput)
  await page.getByRole('tab', { name: /本机 SSH 回归/ }).click()
  await terminal.focus()
  await page.keyboard.insertText('bulk-output')
  await page.waitForFunction(() =>
    document.querySelector('.xterm-rows')?.textContent.includes('OUTPUT_END')
  )
  await page.screenshot({ path: join(output, 'terminal-loopback.png') })
  assert.equal(fixture.state.shells, 1)
  assert.ok(fixture.state.dimensions.length > 1)
  report.checks.push(
    'Full xterm → MessagePort → Engine → ConPTY → system OpenSSH loopback path; fingerprint dialog, authentication marker, Chinese input, Ctrl+C/D/R, alternate screen, >200 KiB output with backpressure, tab persistence and four independent diagnostic channels'
  )
  report.checks.push(
    'Actual UI clipboard paste of 11,000+ characters and diagnostic log copy; original text clipboard restored'
  )
  await terminal.focus()
  await page.keyboard.insertText('exit-fixture')
  await waitSnapshot(page, (snapshot) => snapshot.sessions.every((s) => s.state === 'closed'))
  await page.evaluate(async (id) => {
    const state = await window.supilot.request({ type: 'snapshot' })
    for (const s of state.sessions)
      await window.supilot.request({ type: 'session.close', id: s.id })
    await window.supilot.request({ type: 'host.delete', id })
  }, loopHost.id)
  assert.deepEqual(report.errors, [])
} catch (error) {
  report.failure = error.stack
  throw error
} finally {
  await writeFile(
    join(output, packaged ? 'packaged-validation.json' : 'desktop-validation.json'),
    JSON.stringify(report, null, 2)
  )
  await fixture?.close().catch(() => {})
  if (clipboardBefore !== undefined)
    await app
      ?.evaluate(({ clipboard }, value) => clipboard.writeText(value), clipboardBefore)
      .catch(() => {})
  if (app)
    await app
      .windows()[0]
      ?.evaluate(async (id) => {
        const snapshot = await window.supilot.request({ type: 'snapshot' })
        for (const s of snapshot.sessions)
          await window.supilot.request({ type: 'session.close', id: s.id })
        for (const t of snapshot.tasks)
          if (t.state === 'running') await window.supilot.request({ type: 'task.cancel', id: t.id })
        if (id) await window.supilot.request({ type: 'host.delete', id })
      }, loopId)
      .catch(() => {})
  await app?.close().catch(() => {})
  console.log(JSON.stringify(report, null, 2))
}
