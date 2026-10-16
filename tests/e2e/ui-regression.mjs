import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const settle = (page) => page.waitForTimeout(200) // Beyond the 120ms color transition.
const shot = (page, output, name) => page.screenshot({ path: join(output, `${name}.png`) })
const terminalTab = (page) => page.getByRole('tab', { name: /东京 \/ 新加坡/ })
const activeContent = (page) => page.locator('.tab-content:not([hidden])')
const row = (page, text) => page.locator('.host-row').filter({ hasText: text })

function luminance(rgb) {
  const linear = rgb.map((value) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}
function channels(css) {
  const values = css.match(/[\d.]+/g)?.map(Number)
  assert.ok(values?.length >= 3, `Unsupported computed color: ${css}`)
  return values
}
function contrast(foreground, background) {
  const fg = channels(foreground)
  const bg = channels(background)
  const alpha = fg[3] ?? 1
  const text = fg.slice(0, 3).map((value, i) => value * alpha + bg[i] * (1 - alpha))
  const a = luminance(text), b = luminance(bg.slice(0, 3))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
async function styles(locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      color: s.color, background: s.backgroundColor, fontSize: parseFloat(s.fontSize),
      fontFamily: s.fontFamily, border: s.borderTopColor, borderWidth: s.borderTopWidth,
      outline: s.outlineColor, outlineStyle: s.outlineStyle, filter: s.filter,
      width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height
    }
  })
}
async function setUiSize(page, size) {
  await page.getByLabel('界面与终端设置', { exact: true }).click()
  assert.equal(await page.getByLabel('界面字号', { exact: true }).getAttribute('max'), '17')
  await page.getByLabel('界面字号', { exact: true }).fill(String(size))
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await settle(page)
}
async function resize(app, page, width, height = 940) {
  await app.evaluate(({ BrowserWindow }, { width, height }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w.isMaximized()) w.unmaximize()
    w.setSize(width, height)
  }, { width, height })
  await settle(page)
}

// Sample the rendered background beside the text: this includes the welcome
// radial gradient's transparency and ancestors, instead of assuming the root color.
async function welcomeContrast(page, app, link) {
  const text = link.locator('small')
  const box = await text.boundingBox()
  const png = await page.screenshot({ clip: {
    x: Math.floor(box.x - 2), y: Math.floor(box.y + box.height / 2), width: 1, height: 1
  } })
  const background = await app.evaluate(({ nativeImage }, png) => {
    const bytes = nativeImage.createFromBuffer(Buffer.from(png, 'base64')).getBitmap()
    return `rgb(${bytes[2]}, ${bytes[1]}, ${bytes[0]})`
  }, png.toString('base64'))
  const { color } = await styles(text)
  const ratio = contrast(color, background)
  assert.ok(ratio >= 4.5, `Welcome text contrast ${ratio}`)
  return { color, background, ratio }
}

export async function checkWelcome({ page, app, output, report, root }) {
  // These authored CSS files use root theme tokens. The UI-size token also has a
  // JS setter; test resolved runtime values, without scanning xterm/Tailwind internals.
  const source = (await Promise.all([
    'packages/ui/src/themes/theme.css', 'apps/desktop/src/renderer/app/style.css'
  ].map((path) => readFile(join(root, path), 'utf8')))).join('\n')
  const references = [...new Set([...source.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))]
  const unresolved = await page.evaluate((refs) => refs.filter((ref) =>
    !getComputedStyle(document.documentElement).getPropertyValue(ref).trim()), references)
  assert.deepEqual(unresolved, [], 'All authored theme references resolve in the app')
  report.ui.tokenReferences = references
  report.ui.welcome = []
  const selectors = ['.welcome-link small', '.welcome-note', '.welcome-note code',
    '.welcome-step small', '.welcome-footer-note']
  for (const size of [13, 17]) {
    await setUiSize(page, size)
    const fonts = {}
    for (const selector of selectors) {
      const value = await styles(page.locator(selector).first())
      assert.ok(value.fontSize >= 12 * size / 13 - 0.01, selector)
      fonts[selector] = value.fontSize
    }
    const colors = []
    for (const link of await page.locator('.welcome-link').all()) {
      await page.mouse.move(1, 1)
      await link.scrollIntoViewIfNeeded()
      await settle(page)
      const normal = await welcomeContrast(page, app, link)
      await link.hover()
      await settle(page)
      const hover = await welcomeContrast(page, app, link)
      colors.push({ normal, hover })
    }
    await shot(page, output, `welcome-hover-${size}`)
    report.ui.welcome.push({ size, fonts, colors })
  }
  await setUiSize(page, 13)
  report.checks.push('UI tokens resolve; welcome helper text scales 13→17px and composed normal/hover contrast is ≥4.5:1')
}

export async function checkPrimary({ page, output, report }) {
  const button = page.getByRole('button', { name: '保存主机', exact: true })
  await button.scrollIntoViewIfNeeded()
  await page.mouse.move(1, 1)
  await settle(page)
  const normal = await styles(button)
  await button.hover()
  await settle(page)
  const hover = await styles(button)
  await page.mouse.down()
  await settle(page)
  const pressed = await styles(button)
  assert.equal(await button.evaluate((el) => el.matches(':active')), true)
  // Release off the button so the color check does not save or validate the form.
  await page.mouse.move(1, 1)
  await page.mouse.up()
  await page.keyboard.press('Tab')
  await button.focus()
  await settle(page)
  assert.equal(await button.evaluate((el) => el.matches(':focus-visible')), true)
  const keyboardFocus = await styles(button)
  assert.notEqual(keyboardFocus.outlineStyle, 'none')
  for (const [name, style] of Object.entries({ normal, hover, pressed, keyboardFocus })) {
    assert.equal(style.filter, 'none', `${name}: no brightness filter masks final colors`)
    style.contrast = contrast(style.color, style.background)
    assert.ok(style.contrast >= 4.5, `${name}: primary text contrast ${style.contrast}`)
    assert.equal(style.width, normal.width)
    assert.equal(style.height, normal.height)
  }
  report.ui.primary = { normal, hover, pressed, keyboardFocus }
  await shot(page, output, 'primary-keyboard-focus')
  report.checks.push('Primary button normal/hover/pressed/keyboard-focus text contrast ≥4.5:1; no geometry change')
}

export async function checkWorkbench({ page, app, output, report }) {
  const prefsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('supilot-ui')))
  report.ui.fonts = []
  report.ui.windows = []
  report.ui.ansi = []
  const minSize = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMinimumSize())
  report.ui.minimumWindow = minSize
  const shellColors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const status = getComputedStyle(document.querySelector('.status-bar'))
    return {
      background: root.getPropertyValue('--background').trim(),
      surface: root.getPropertyValue('--surface').trim(),
      status: status.backgroundColor,
      statusText: status.color,
      selection: root.getPropertyValue('--selection-active').trim(),
      ring: root.getPropertyValue('--ring').trim()
    }
  })
  assert.equal(shellColors.status, 'rgb(16, 18, 22)', 'Formal/demo status bar uses a neutral shell color')
  assert.ok(contrast(shellColors.statusText, shellColors.status) >= 4.5)
  report.ui.shellColors = shellColors
  for (const ansi of ['dark-plus', 'graphite', 'classic']) {
    await page.getByLabel('界面与终端设置', { exact: true }).click()
    await page.getByLabel('终端 ANSI 配色').selectOption(ansi)
    await page.getByRole('button', { name: '完成', exact: true }).click()
    await settle(page)
    const terminal = await styles(page.locator('.terminal-pane').first())
    assert.match(terminal.background, /^rgb\(/)
    report.ui.ansi.push({ ansi, terminalBackground: terminal.background })
  }
  await page.getByLabel('界面与终端设置', { exact: true }).click()
  await page.getByLabel('终端 ANSI 配色').selectOption(prefsBefore.ansi)
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await settle(page)
  for (const size of [13, 17]) {
    await resize(app, page, 1440)
    await setUiSize(page, size)
    await terminalTab(page).click()
    const fonts = {}
    for (const selector of ['.host-copy strong', '.host-state', '.detail-fields dd',
      '.detail-state', '.detail-section small', '.detail-footnote']) {
      const value = await styles(page.locator(selector).filter({ visible: true }).first())
      const minimum = selector === '.host-copy strong' ? size : 12 * size / 13
      assert.ok(value.fontSize >= minimum - 0.01, selector)
      fonts[selector] = value.fontSize
    }
    fonts.xterm = (await styles(page.locator('.xterm-rows').first())).fontSize
    assert.equal(fonts.xterm, prefsBefore.terminalSize, 'UI font does not resize xterm')
    await page.getByLabel('搜索主机', { exact: true }).fill('alpine')
    fonts.search = (await styles(page.locator('.search-match'))).fontSize
    assert.ok(fonts.search >= 12 * size / 13 - 0.01)
    await page.getByRole('button', { name: '清除搜索', exact: true }).click()
    await page.getByRole('button', { name: '快速打开主机', exact: true }).click()
    await page.getByRole('combobox', { name: '快速搜索主机' }).fill('alpine')
    const quick = await styles(page.locator('.quick-result small'))
    const selected = await styles(page.locator('.quick-result[aria-selected="true"]'))
    fonts.quick = quick.fontSize
    assert.ok(quick.fontSize >= 12 * size / 13 - 0.01)
    assert.ok(contrast(quick.color, selected.background) >= 4.5)
    await shot(page, output, `quick-open-${size}`)
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: '任务记录', exact: true }).click()
    const log = await styles(page.locator('.log-panel pre'))
    fonts.log = log.fontSize
    assert.ok(log.fontSize >= 12 * size / 13 - 0.01)
    assert.match(log.fontFamily, /Cascadia Mono|Consolas/)
    await shot(page, output, `task-log-${size}`)
    report.ui.fonts.push({ size, fonts })
    await terminalTab(page).click()
    const windows = [
      [minSize[0], minSize[1]],
      [900, 650],
      [1280, 800],
      [1440, 940]
    ]
    for (const [width, height] of windows) {
      await resize(app, page, width, height)
      const layout = await page.evaluate(() => {
        const header = document.querySelector('.app-header')
        const command = document.querySelector('.command-center')
        const box = command.getBoundingClientRect()
        const activePane = document.querySelector('.tab-content:not([hidden]) .terminal-pane')
        const paneHeader = activePane?.querySelector('.pane-header')
        const selectedHost = document.querySelector('.host-row.selected')
        const selection = document.querySelector('.host-selection')
        const actions = selection?.querySelector('.selection-actions')
        const tabBar = document.querySelector('.tab-bar')
        const tabActions = document.querySelector('.tab-actions')
        const children = [...header.children].filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right } })
        const bounds = (el) => el ? (() => { const r = el.getBoundingClientRect(); return {
          left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height
        } })() : null
        return { viewport: innerWidth, viewportHeight: innerHeight, command: box.width, headerOverflow: header.scrollWidth - header.clientWidth,
          overflow: document.documentElement.scrollWidth - innerWidth,
          overlap: children.some((r, i) => i && r.left < children[i - 1].right - 1),
          right: children.at(-1).right,
          contextVisible: getComputedStyle(document.querySelector('.command-context')).display !== 'none',
          activePane: bounds(activePane), paneHeader: bounds(paneHeader), selectedHost: bounds(selectedHost),
          selection: bounds(selection), actions: bounds(actions), tabBar: bounds(tabBar), tabActions: bounds(tabActions),
          terminalToolbarCount: document.querySelectorAll('.terminal-tab-bar .toolbar-actions').length,
          workspaceToolbarCount: document.querySelectorAll('.workspace-toolbar').length }
      })
      const limit = layout.viewport <= 900 ? Math.min(layout.viewport * 0.28, 260) : Math.min(420, layout.viewport * 0.38)
      assert.ok(layout.command <= limit + 1 && layout.command > 100, JSON.stringify(layout))
      assert.ok(layout.headerOverflow <= 1 && layout.overflow <= 1 && !layout.overlap, JSON.stringify(layout))
      assert.ok(layout.right <= layout.viewport)
      assert.equal(layout.contextVisible, layout.viewport > 900)
      if (layout.viewport > 900) assert.ok(layout.command > 260)
      assert.ok(layout.selectedHost?.width > 80 && layout.selectedHost?.height > 0)
      assert.ok(layout.actions?.bottom <= layout.selection?.bottom + 1, JSON.stringify(layout))
      assert.ok(layout.paneHeader?.height >= 30 && layout.paneHeader?.bottom <= layout.activePane?.bottom + 1)
      assert.equal(layout.terminalToolbarCount, 1)
      assert.equal(layout.workspaceToolbarCount, 0)
      assert.ok(layout.tabActions?.left >= layout.tabBar?.left)
      report.ui.windows.push({ size, outerWidth: width, ...layout })
      await shot(page, output, `window-${width}x${height}-ui-${size}`)
    }
  }
  await setUiSize(page, 13)
  await resize(app, page, 1440, 940)
  const prefsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('supilot-ui')))
  assert.equal(prefsAfter.terminalSize, prefsBefore.terminalSize)
  assert.equal(prefsAfter.ansi, prefsBefore.ansi)
  await row(page, '北京').click()
  assert.match(await page.locator('.host-selection strong').innerText(), /北京/)
  assert.match(await page.locator('.pane-identity').first().innerText(), /东京/)
  assert.match(await page.locator('.detail-identity h3').innerText(), /东京/)
  assert.equal(await page.getByRole('button', { name: /系统诊断 · 列表选中主机：北京/ }).count(), 1)
  assert.equal(await page.getByRole('button', { name: /系统诊断 · 当前会话目标：东京/ }).count(), 1)
  await shot(page, output, 'selection-B-session-A')
  await page.getByRole('button', { name: /系统诊断 · 列表选中主机：北京/ }).click()
  assert.match(await activeContent(page).locator('.target-strip strong').innerText(), /北京/)
  await row(page, '长期归档').click()
  assert.match(await activeContent(page).locator('.target-strip strong').innerText(), /北京/)
  await page.getByRole('button', { name: '运行演示诊断', exact: true }).click()
  assert.match(await page.locator('.task-target strong').innerText(), /北京/)
  await row(page, '东京 · 边缘节点 01').click()
  assert.match(await page.locator('.task-target strong').innerText(), /北京/)
  // Close only the extra B diagnostic tab; retain the pre-existing A tab and checks.
  await page.getByRole('tab', { name: '系统诊断', exact: true }).last().click()
  await page.locator('.work-tab.active > .icon-button').click()
  await terminalTab(page).click()
  await row(page, '北京').click()
  await page.getByRole('button', { name: /系统诊断 · 当前会话目标：东京/ }).click()
  assert.match(await activeContent(page).locator('.target-strip strong').innerText(), /东京/)
  await row(page, '长期归档').click()
  assert.match(await activeContent(page).locator('.target-strip strong').innerText(), /东京/)
  await page.getByRole('button', { name: /系统诊断 · 列表选中主机：长期归档/ }).click()
  await setUiSize(page, 17)
  assert.match(await page.locator('.detail-identity h3').innerText(), /长期归档/)
  assert.match(await row(page, '长期归档').getAttribute('title'), /长期归档.*\n.*192\.0\.2\./)
  await shot(page, output, 'long-chinese-host-details-17')
  await page.locator('.work-tab.active > .icon-button').click()
  await terminalTab(page).click()
  await row(page, '东京 · 边缘节点 01').click()
  await setUiSize(page, 13)
  report.checks.push('Default/17px host, details, search, quick-open and monospace log fonts; independent xterm preferences; min/900/1280/1440 window layout')
  report.checks.push('Selection B/session A: both diagnostic entry targets match labels; opened operations and created task snapshots stay fixed after selection changes')
}

export async function checkTerminalFocus({ page, app, output, report }) {
  const pane = page.locator('.terminal-pane').first()
  const input = pane.locator('.xterm-helper-textarea')
  await input.focus()
  await page.waitForSelector('.terminal-pane.focused.input-focused')
  const focused = await styles(pane)
  const ring = await page.evaluate(() => {
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--ring').trim()
    return `rgb(${hex.slice(1).match(/../g).map((x) => parseInt(x, 16)).join(', ')})`
  })
  assert.equal(focused.border, ring, 'Real xterm input wins over active-pane style')
  const adjacent = await styles(pane.locator('.pane-header'))
  assert.ok(contrast(focused.border, focused.background) >= 3)
  assert.ok(contrast(focused.border, adjacent.background) >= 3)
  const metrics = await styles(pane.locator('.xterm-screen'))
  await pane.locator('.pane-actions button').last().focus()
  await page.waitForFunction(() => !document.querySelector('.terminal-pane.input-focused'))
  const active = await styles(pane)
  assert.notEqual(active.border, focused.border, 'Header focus is not terminal input')
  assert.equal(active.width, focused.width)
  assert.equal(active.height, focused.height)
  assert.deepEqual(await styles(pane.locator('.xterm-screen')), metrics, 'Focus does not resize xterm')
  await input.focus()
  await page.getByRole('button', { name: '快速打开主机', exact: true }).click()
  await page.getByRole('combobox', { name: '快速搜索主机' }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.terminal-pane.input-focused'))
  assert.equal(await page.getByRole('combobox', { name: '快速搜索主机' }).evaluate((el) => el === document.activeElement), true)
  await shot(page, output, 'real-terminal-quick-open-focus')
  await page.keyboard.press('Escape')
  await input.focus()
  await page.getByLabel('界面与终端设置', { exact: true }).click()
  assert.equal(await page.locator('.terminal-pane.input-focused').count(), 0)
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await input.focus()
  await page.getByRole('button', { name: '添加主机', exact: true }).first().click()
  assert.equal(await page.locator('.terminal-pane.input-focused').count(), 0)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '左右分屏', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.terminal-pane .status-authenticated').length === 2)
  const second = page.locator('.terminal-pane').nth(1)
  for (const [index, current] of [pane, second].entries()) {
    await current.locator('.xterm-helper-textarea').focus()
    await page.waitForFunction((index) => document.querySelectorAll('.terminal-pane')[index]?.classList.contains('input-focused'), index)
    assert.equal(await page.locator('.terminal-pane.input-focused').count(), 1)
    const currentStyle = await styles(current)
    assert.equal(currentStyle.border, ring)
    const other = index === 0 ? second : pane
    assert.notEqual((await styles(other)).border, ring)
    const marker = `UI_FOCUS_PANE_${index}`
    await page.keyboard.insertText(marker)
    await page.waitForFunction(({ index, marker }) => document.querySelectorAll('.terminal-pane')[index]?.querySelector('.xterm-rows')?.textContent.includes(marker), { index, marker })
    assert.equal(await other.locator('.xterm-rows').innerText().then((t) => t.includes(marker)), false)
    await shot(page, output, `real-dual-terminal-focus-${index}`)
  }
  await second.locator('.pane-actions button').last().click()
  assert.equal(await page.locator('.terminal-pane.input-focused').count(), 0)
  await page.getByRole('button', { name: '确认关闭终端会话', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.terminal-pane').length === 1)
  // Exercise the maximum UI setting on a real xterm too, preserving terminal pixels.
  const terminalSize = (await styles(pane.locator('.xterm-rows'))).fontSize
  await setUiSize(page, 17)
  assert.equal((await styles(pane.locator('.xterm-rows'))).fontSize, terminalSize)
  await setUiSize(page, 13)
  report.ui.realFocus = { focused, active, adjacent,
    innerContrast: contrast(focused.border, focused.background),
    headerContrast: contrast(focused.border, adjacent.background) }
  report.checks.push('Real loopback xterm focus wins, header/modal/form focus clears it, two real panes receive distinct input, no focus geometry or terminal-font change')
}
