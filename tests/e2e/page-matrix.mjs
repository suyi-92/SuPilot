import assert from 'node:assert/strict'
import { join } from 'node:path'

export const pageScenes = [
  { name: 'welcome', selector: '.welcome', controls: '.welcome-actions button, .welcome-settings, .welcome-entry p' },
  { name: 'form', selector: '.host-form-scroll', controls: '.host-form-actions button, .input-action button, .form-advanced summary, .field-label' },
  { name: 'diagnostic', selector: '.tab-content:not([hidden]) .operation-page', controls: '.operation-footer button, .execution-details summary, .operation-notes p' },
  { name: 'tasks', selector: '.tab-content:not([hidden]) .tasks-page', controls: '.task-actions button, .log-panel header button, .steps-nav button, .result-message strong, .result-message small' }
]
const epsilon = 1 / 64
export function inside(a, b) { return a && b && a.width > 0 && a.height > 0 && a.left >= b.left - epsilon && a.right <= b.right + epsilon && a.top >= b.top - epsilon && a.bottom <= b.bottom + epsilon }
const overlap = (a, b) => a.left < b.right - epsilon && a.right > b.left + epsilon && a.top < b.bottom - epsilon && a.bottom > b.top + epsilon

export async function measureContent(locator) {
  await locator.scrollIntoViewIfNeeded()
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
  return locator.evaluate((el) => {
    const rect = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height })
    const box = rect(el.getBoundingClientRect())
    const visible = { ...box }
    for (let node = el; node; node = node.parentElement) {
      const b = node.getBoundingClientRect(), s = getComputedStyle(node)
      if (node === el || /(hidden|auto|scroll|clip)/.test(s.overflowX)) { visible.left = Math.max(visible.left, b.left + parseFloat(s.borderLeftWidth)); visible.right = Math.min(visible.right, b.right - parseFloat(s.borderRightWidth)) }
      if (node === el || /(hidden|auto|scroll|clip)/.test(s.overflowY)) { visible.top = Math.max(visible.top, b.top + parseFloat(s.borderTopWidth)); visible.bottom = Math.min(visible.bottom, b.bottom - parseFloat(s.borderBottomWidth)) }
    }
    visible.left = Math.max(0, visible.left); visible.right = Math.min(innerWidth, visible.right)
    visible.top = Math.max(0, visible.top); visible.bottom = Math.min(innerHeight, visible.bottom)
    const texts = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const n = walker.currentNode
      if (!n.textContent.trim() || n.parentElement.closest('svg,.sr-only')) continue
      const range = document.createRange(); range.selectNodeContents(n)
      texts.push({ text: n.textContent, rects: [...range.getClientRects()].map(rect) })
    }
    const icons = [...el.querySelectorAll('svg')].map((n) => rect(n.getBoundingClientRect()))
    const neighbors = [...(el.parentElement?.children || [])].filter((n) => n !== el && n.matches('button,select,input')).map((n) => rect(n.getBoundingClientRect())).filter((r) => r.width && r.height)
    const points = texts.flatMap((t) => t.rects).concat(icons).map((r) => {
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
      return { rect: r, hit: !!hit && (hit === el || el.contains(hit)), hitTag: hit?.tagName, hitClass: hit?.getAttribute('class') }
    })
    return { text: el.textContent, box, visible, texts, icons, neighbors, points, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
  })
}
export function assertContent(m) {
  assert.ok(m.box.width && m.box.height, 'Required control is present')
  assert.ok(m.scrollWidth <= m.clientWidth, `Control content overflow: ${m.text}`)
  const textRects = m.texts.flatMap((t) => t.rects)
  for (const rect of [...textRects, ...m.icons]) {
    assert.ok(inside(rect, m.visible), `Actual content clipped: ${JSON.stringify(m)}`)
    for (const neighbor of m.neighbors) assert.ok(!overlap(rect, neighbor), `Content overlaps adjacent control: ${m.text}`)
  }
  for (const rect of textRects) for (const icon of m.icons) assert.ok(!overlap(rect, icon), `Text overlaps SVG: ${m.text}`)
  for (const point of m.points) assert.ok(point.hit, `Content obscured: ${JSON.stringify(point)} / ${m.text}`)
}
export async function checkControls(scope, selector, record) {
  for (const control of await scope.locator(selector).all()) {
    if (!await control.isVisible()) continue
    const m = await measureContent(control)
    record.push(m) // Preserve measured evidence even on assertion failure.
    assertContent(m)
  }
  assert.ok(record.length, 'Required page controls were measured')
}
export function contrast(a, b) {
  const lum = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0)
  const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
}
async function renderedColors(locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el)
    let bg = [0, 0, 0], surrounding = bg
    const chain = []; for (let n = el; n; n = n.parentElement) chain.unshift(n)
    for (const n of chain) { if (n === el) surrounding = bg; const c = getComputedStyle(n).backgroundColor.match(/[\d.]+/g)?.map(Number); if (!c) continue; const alpha = c[3] ?? 1; bg = bg.map((v, i) => c[i] * alpha + v * (1 - alpha)) }
    return { color: s.color, background: `rgb(${bg.join(', ')})`, surrounding: `rgb(${surrounding.join(', ')})`, outline: s.outlineColor, outlineStyle: s.outlineStyle, outlineOffset: parseFloat(s.outlineOffset), focusVisible: el.matches(':focus-visible'), active: el.matches(':active') }
  })
}
export async function checkColors(scope, record) {
  for (const selector of ['h1', '.welcome-subtitle', '.welcome-entry p', '.welcome-state small', '.field-label label', '.field small:not(:empty)', '.result-message strong', '.result-message p', '.result-message small', '.target-strip strong', '.operation-notes p']) {
    const el = scope.locator(selector).first()
    if (!await el.count() || !await el.isVisible()) continue
    const c = await renderedColors(el); c.ratio = contrast(c.color, c.background); record.push({ selector, ...c }); assert.ok(c.ratio >= 4.5, `${selector}: contrast ${c.ratio}`)
  }
  const button = scope.locator('.button:not(:disabled)').first()
  if (!await button.count()) return
  await button.scrollIntoViewIfNeeded()
  for (const state of ['normal', 'hover', 'pressed', 'focus']) {
    if (state === 'normal') await button.page().mouse.move(1, 1)
    if (state === 'hover') await button.hover()
    if (state === 'pressed') await button.page().mouse.down()
    if (state === 'focus') { await button.page().mouse.move(1, 1); await button.page().mouse.up(); await button.page().keyboard.press('Tab'); await button.focus() }
    await button.page().waitForTimeout(140)
    const c = await renderedColors(button); c.ratio = contrast(c.color, c.background)
    if (state === 'focus') c.focusRatio = contrast(c.outline, c.outlineOffset > 0 ? c.surrounding : c.background)
    record.push({ state, ...c }); assert.ok(c.ratio >= 4.5, `${state}: contrast ${c.ratio}`)
    if (state === 'pressed') assert.equal(c.active, true)
    if (state === 'focus') {
      assert.equal(c.focusVisible, true); assert.notEqual(c.outlineStyle, 'none')
      // The existing offset ring lies on the surrounding page, outside the blue fill.
      assert.ok(c.focusRatio >= 3)
    }
  }
}
export async function checkPageMatrix({ page, app, output, report }, name) {
  const scene = pageScenes.find((item) => item.name === name)
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('supilot-ui')))
  const originalSize = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize())
  const setSize = async (size) => {
    await page.getByLabel('界面与终端设置', { exact: true }).click()
    await page.getByLabel('界面字号', { exact: true }).fill(String(size))
    await page.getByRole('button', { name: '完成', exact: true }).click()
  }
  const panel = page.locator('.main-panels > [data-panel-id="hosts"]')
  const handle = page.locator('.main-panels > .resize-handle').first()
  const records = (report.pageMatrix ??= [])
  try {
    for (const size of [12, 13, 17]) for (const [width, height] of [[850, 600], [900, 650], [1280, 800], [1440, 900]]) {
      await app.evaluate(({ BrowserWindow }, s) => { const w = BrowserWindow.getAllWindows()[0]; if (w.isMaximized()) w.unmaximize(); w.setSize(...s) }, [width, height])
      await setSize(size)
      await page.waitForTimeout(160)
      const originalHandle = await handle.boundingBox()
      const originalSidebar = await page.locator('.host-sidebar').boundingBox()
      if (width === 850) {
        const g = await page.locator('.main-panels').boundingBox()
        await page.mouse.move(originalHandle.x + originalHandle.width / 2, originalHandle.y + 80); await page.mouse.down(); await page.mouse.move(g.x + 1, originalHandle.y + 80, { steps: 8 }); await page.mouse.up()
        assert.ok(Math.abs(Number(await panel.getAttribute('data-panel-size')) - Number(await handle.getAttribute('aria-valuemin'))) <= .01)
      }
      const scope = page.locator(scene.selector)
      const env = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { actualOuter: w.getSize(), contentSize: w.getContentSize(), minimum: w.getMinimumSize(), zoom: w.webContents.getZoomFactor() } })
      const row = { page: name, requested: [width, height], uiSize: size, ...env, controls: [], colors: [] }; records.push(row)
      try {
        row.environment = await scope.evaluate((el) => ({ viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, actualUiSize: parseFloat(getComputedStyle(document.documentElement).fontSize), containerWidth: el.getBoundingClientRect().width, sidebarWidth: document.querySelector('.host-sidebar').getBoundingClientRect().width, detailWidth: document.querySelector('.details-sidebar')?.getBoundingClientRect().width || 0, taskDrawerHeight: document.querySelector('.task-drawer')?.getBoundingClientRect().height || 0 }))
        assert.equal(row.environment.actualUiSize, size)
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('supilot-ui')).terminalSize), prefs.terminalSize)
        await checkControls(scope, scene.controls, row.controls)
        if (name === 'form') {
          const advanced = scope.locator('.form-advanced'); const opened = await advanced.getAttribute('open') !== null
          if (!opened) await advanced.locator('summary').click()
          const input = scope.getByLabel('远端 sshd 监听端口（可选）')
          await input.focus(); await input.evaluate((el) => el.scrollIntoView({ block: 'center' }))
          row.lastField = await input.evaluate((el) => { const f = el.closest('.field').getBoundingClientRect(), footer = document.querySelector('.host-form-actions').getBoundingClientRect(); return { top: f.top, bottom: f.bottom, footerTop: footer.top, focused: document.activeElement === el } })
          assert.ok(row.lastField.focused && row.lastField.bottom <= row.lastField.footerTop, JSON.stringify(row.lastField))
          await page.screenshot({ path: join(output, `page-${name}-${width}x${height}-ui-${size}-last-field.png`) })
          if (!opened) await advanced.locator('summary').click()
        }
        await checkColors(scope, row.colors)
        await page.screenshot({ path: join(output, `page-${name}-${width}x${height}-ui-${size}-actions.png`) })
        await scope.evaluate((el) => { (el.closest('.page-scroll') || el.querySelector('.page-scroll') || el).scrollTop = 0 })
        await page.screenshot({ path: join(output, `page-${name}-${width}x${height}-ui-${size}.png`) })
      } finally {
        if (width === 850) {
          const h = await handle.boundingBox(); await page.mouse.move(h.x + h.width / 2, h.y + 80); await page.mouse.down(); await page.mouse.move(originalHandle.x + originalHandle.width / 2, h.y + 80, { steps: 8 }); await page.mouse.up()
          const restored = await page.locator('.host-sidebar').boundingBox(); row.sidebarRestorationDelta = restored.width - originalSidebar.width; assert.ok(Math.abs(row.sidebarRestorationDelta) <= .5)
        }
      }
    }
  } finally {
    await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setSize(...s), originalSize)
    await setSize(prefs.uiSize)
  }
}
