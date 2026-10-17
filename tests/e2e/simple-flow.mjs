import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createSSHFixture } from '../fixtures/ssh-server.mjs'

const root = resolve(import.meta.dirname, '../..')
const packaged = process.argv.includes('--packaged')
const require = createRequire(join(root, 'apps/desktop/package.json'))
const output = join(root, '.local/Test/ux-migration', `${packaged ? 'packaged' : 'desktop'}-${Date.now()}`)
await mkdir(output, { recursive: true })
const executablePath = packaged ? join(root, 'release/win-unpacked/SuPilot.exe') : require('electron')
const env = { ...process.env, SUPILOT_TEST: '1' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath, args: packaged ? [] : [join(root, 'apps/desktop')], env, timeout: 30000 })
const page = await app.firstWindow()
page.setDefaultTimeout(10000)
const report = { packaged, output, checks: [], errors: [] }
let fixture
let hostId

async function waitSnapshot(predicate) {
  const start = Date.now()
  while (Date.now() - start < 25000) {
    const snapshot = await page.evaluate(() => window.supilot.request({ type: 'snapshot' }))
    if (predicate(snapshot)) return snapshot
    await page.waitForTimeout(100)
  }
  throw new Error('snapshot condition timed out')
}
async function shot(name) { await page.screenshot({ path: join(output, `${name}.png`) }) }

try {
  page.on('pageerror', (error) => report.errors.push(error.message))
  await page.waitForFunction(() => !!window.supilot)
  await page.waitForFunction(() => !document.body.textContent.includes('正在加载本机工作区'))
  for (const label of ['主机', '终端', '工具']) assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 1)
  assert.equal(await page.getByRole('button', { name: '设置', exact: true }).count(), 1)
  report.checks.push('启动默认进入主机页，顶部稳定入口可达')
  await shot('hosts')

  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('界面字号', { exact: true }).fill('17')
  await page.getByLabel('终端字号', { exact: true }).fill('16')
  await shot('settings')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('supilot-ui')))
  assert.equal(prefs.uiSize, 17); assert.equal(prefs.terminalSize, 16)
  report.checks.push('设置覆盖层保存界面与终端字号，使用 supilot-ui 持久化')

  fixture = await createSSHFixture()
  const hostName = `本机回环 · 简化流程 ${Date.now()}`
  const host = await page.evaluate(({ port, login, name }) => window.supilot.request({ type: 'host.save', host: {
    name, address: '127.0.0.1', port, sshdPort: null, username: 'tester',
    auth: 'key', keyPath: login, group: '隔离验证', tags: ['loopback'], notes: '仅测试合成 SSH 服务。'
  } }), { port: fixture.port, login: fixture.login, name: hostName })
  hostId = host.id
  await waitSnapshot((snapshot) => snapshot.hosts.some((item) => item.id === hostId))
  await page.locator('.host-card').filter({ hasText: hostName }).getByRole('button', { name: '连接', exact: true }).click()
  await page.getByRole('heading', { name: '核对服务器身份' }).waitFor()
  await page.getByRole('button', { name: '已独立核对，信任并继续' }).click()
  await waitSnapshot((snapshot) => snapshot.sessions.some((session) => session.target.id === hostId && session.state === 'authenticated'))
  await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('LOOPBACK SSH FIXTURE'))
  await shot('terminal')
  await page.getByRole('button', { name: '左右分屏', exact: true }).click()
  await waitSnapshot((snapshot) => snapshot.sessions.filter((session) => session.target.id === hostId && session.state === 'authenticated').length >= 2)
  await shot('terminal-split')
  report.checks.push('真实本机回环 SSH、信任核对、认证和 xterm 输出通过')

  const sessionBefore = await page.evaluate(() => window.supilot.request({ type: 'snapshot' }))
  const sessionId = sessionBefore.sessions.find((session) => session.target.id === hostId).id
  const terminal = page.locator('.xterm-helper-textarea').first()
  await terminal.focus(); await page.keyboard.insertText('未提交输入')
  await page.getByRole('button', { name: '主机', exact: true }).click()
  await page.getByRole('button', { name: '工具', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: /^终端/ }).click()
  const sessionAfter = await page.evaluate(() => window.supilot.request({ type: 'snapshot' }))
  assert.equal(sessionAfter.sessions.find((session) => session.id === sessionId)?.state, 'authenticated')
  assert.ok((await page.locator('.terminal-pane').count()) >= 2)
  report.checks.push('切换主机、工具、设置后返回终端，分屏会话与原 session 保持')

  await page.getByRole('button', { name: '工具', exact: true }).click()
  await shot('tools')
  await page.getByRole('button', { name: '打开诊断', exact: true }).click()
  await shot('diagnostic')
  await page.getByRole('button', { name: '开始只读诊断', exact: true }).click()
  await waitSnapshot((snapshot) => snapshot.tasks.some((task) => task.target.id === hostId && task.state === 'succeeded'))
  await page.getByRole('button', { name: /打开任务/ }).click()
  assert.ok(await page.getByRole('dialog', { name: '任务' }).count())
  await shot('tasks-overlay')
  await page.getByRole('button', { name: '查看全部任务', exact: true }).click()
  await page.getByText('系统诊断', { exact: true }).first().waitFor()
  await shot('tasks')
  report.checks.push('真实四项只读诊断完成，任务浮层与任务结果页共用数据，完成不抢终端')

  await page.getByRole('button', { name: '主机', exact: true }).click()
  await page.getByRole('button', { name: `编辑 ${host.name}`, exact: true }).click()
  await shot('editor')
  await page.getByLabel('主机名称', { exact: true }).fill('本机回环 · 草稿保留')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  assert.equal(await page.getByLabel('主机名称', { exact: true }).inputValue(), '本机回环 · 草稿保留')
  await page.getByRole('button', { name: /^终端/ }).click()
  await page.getByRole('heading', { name: '放弃未保存的修改' }).waitFor()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  assert.equal(await page.getByLabel('主机名称', { exact: true }).inputValue(), '本机回环 · 草稿保留')
  report.checks.push('编辑页独立呈现，设置不丢草稿，真实离页入口触发未保存保护')

  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('heading', { name: '放弃未保存的修改' }).waitFor()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(850, 600))
  await page.waitForTimeout(120)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await shot('small-settings-17')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 800))
  await page.evaluate(async (id) => { const snapshot = await window.supilot.request({ type: 'snapshot' }); for (const session of snapshot.sessions) await window.supilot.request({ type: 'session.close', id: session.id }); await window.supilot.request({ type: 'host.delete', id }) }, hostId)
  assert.equal((await waitSnapshot((snapshot) => !snapshot.hosts.some((item) => item.id === hostId))).hosts.some((item) => item.id === hostId), false)
} catch (error) {
  report.failure = error.stack
  await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await fixture?.close().catch(() => {})
  await writeFile(join(output, packaged ? 'packaged-validation.json' : 'desktop-validation.json'), JSON.stringify(report, null, 2))
  await app.close().catch(() => {})
  console.log(JSON.stringify(report, null, 2))
}
