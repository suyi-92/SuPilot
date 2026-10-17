import assert from 'node:assert/strict'
import { join } from 'node:path'

// A flex item's box can fit while its nowrap text paints outside it. Measure the
// actual short label, unlike host names/endpoints where ellipsis is intentional.
export async function measureSelectionActions(page) {
  return page.locator('.selection-actions').evaluate((actions) => {
    const rect = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      width: r.width, height: r.height })
    const bounds = (el) => el ? rect(el.getBoundingClientRect()) : null
    const appearance = (el) => {
      if (!el) return null
      const s = getComputedStyle(el)
      return { overflowX: s.overflowX, overflowY: s.overflowY, textOverflow: s.textOverflow,
        visibility: s.visibility, display: s.display, opacity: s.opacity, fontSize: s.fontSize }
    }
    const visibleBounds = (el) => {
      const visible = { left: 0, right: innerWidth, top: 0, bottom: innerHeight }
      for (let node = el; node; node = node.parentElement) {
        const box = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        if (node === el || style.overflowX !== 'visible') {
          visible.left = Math.max(visible.left, box.left + parseFloat(style.borderLeftWidth))
          visible.right = Math.min(visible.right, box.right - parseFloat(style.borderRightWidth))
        }
        if (node === el || style.overflowY !== 'visible') {
          visible.top = Math.max(visible.top, box.top + parseFloat(style.borderTopWidth))
          visible.bottom = Math.min(visible.bottom, box.bottom - parseFloat(style.borderBottomWidth))
        }
      }
      return { ...visible, width: visible.right - visible.left, height: visible.bottom - visible.top }
    }
    return { box: bounds(actions), sidebar: bounds(document.querySelector('.host-sidebar')),
      buttons: [...actions.querySelectorAll('button')].map((button) => {
        const label = button.querySelector('.selection-action-label')
        const range = document.createRange()
        if (label) range.selectNodeContents(label)
        return { ariaLabel: button.getAttribute('aria-label'), title: button.getAttribute('title'),
          box: bounds(button), visible: visibleBounds(button), style: appearance(button),
          icon: bounds(button.querySelector('svg')), label: label ? {
            text: label.textContent, box: bounds(label), visible: visibleBounds(label),
            textBox: rect(range.getBoundingClientRect()), textRects: [...range.getClientRects()].map(rect),
            scrollWidth: label.scrollWidth, clientWidth: label.clientWidth, style: appearance(label)
          } : null }
      }) }
  })
}

export function assertSelectionActions(actions) {
  // Only absorb DOMRect's 1/64 CSS-pixel quantization, never a clipped character.
  const epsilon = 1 / 64
  const inside = (child, parent) => child && parent && child.width > 0 && child.height > 0 &&
    child.left >= parent.left - epsilon && child.right <= parent.right + epsilon &&
    child.top >= parent.top - epsilon && child.bottom <= parent.bottom + epsilon
  const overlaps = (a, b) => a && b && a.left < b.right - epsilon && a.right > b.left + epsilon &&
    a.top < b.bottom - epsilon && a.bottom > b.top + epsilon
  assert.equal(actions.buttons.length, 3)
  const primary = actions.buttons[0]
  assert.equal(primary.ariaLabel, '新建会话')
  assert.equal(primary.title, '新建会话')
  assert.equal(primary.label?.text, '新建', 'The complete short label is required')
  assert.ok(primary.label.textRects.length > 0, 'Required label must have rendered text rects')
  for (const button of actions.buttons) {
    assert.ok(inside(button.box, actions.box), `${button.ariaLabel}: button outside action area`)
    assert.ok(inside(button.icon, button.visible), `${button.ariaLabel}: SVG outside visible button`)
    for (const other of actions.buttons.filter((item) => item !== button)) {
      assert.ok(!overlaps(button.box, other.box), 'Action button hit areas overlap')
    }
  }
  for (const text of primary.label.textRects) {
    assert.ok(inside(text, primary.visible), `新建 text content outside visible button: ${JSON.stringify({ text, button: primary.visible })}`)
    assert.ok(inside(text, primary.label.visible), 'Short label content is clipped or overflows its span')
    assert.ok(!overlaps(text, primary.icon), 'Short label overlaps its SVG')
    for (const neighbor of actions.buttons.slice(1)) {
      assert.ok(!overlaps(text, neighbor.box), 'Short label enters a neighboring action')
    }
  }
  assert.ok(primary.label.clientWidth > 0, 'Required label must not collapse to zero width')
  assert.ok(primary.label.scrollWidth <= primary.label.clientWidth, 'Short label scrollWidth exceeds clientWidth')
  assert.equal(primary.label.style.visibility, 'visible')
  assert.notEqual(primary.label.style.display, 'none')
  assert.equal(primary.label.style.opacity, '1')
  assert.notEqual(primary.label.style.textOverflow, 'ellipsis', 'Short action label must be complete')
}

async function sidebarGeometry(page) {
  const handle = page.locator('.main-panels > .resize-handle').first()
  const box = await handle.boundingBox()
  assert.ok(box, 'Required sidebar resize handle must be visible')
  const panel = page.locator('.main-panels > [data-panel-id="hosts"]')
  const sidebar = await page.locator('.host-sidebar').boundingBox()
  assert.ok(sidebar, 'Required host sidebar must be visible')
  return { handle: box, handleX: box.x + box.width / 2, sidebarWidth: sidebar.width,
    percentage: Number(await panel.getAttribute('data-panel-size')),
    minimumPercentage: Number(await handle.getAttribute('aria-valuemin')) }
}

async function dragSidebar(page, x) {
  const { handle, handleX } = await sidebarGeometry(page)
  await page.mouse.move(handleX, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, handle.y + handle.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)
}

export async function captureSelectionActions({ page, app, output, report }, name) {
  const window = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return { outerSize: w.getSize(), contentSize: w.getContentSize(),
      minimumSize: w.getMinimumSize(), zoom: w.webContents.getZoomFactor() }
  })
  const environment = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio, uiSize: parseFloat(getComputedStyle(document.documentElement).fontSize) }))
  const geometry = await sidebarGeometry(page)
  const actions = await measureSelectionActions(page)
  const measurement = { name, ...window, ...environment, ...geometry, actions }
  ;(report.ui.selectionActions ??= []).push(measurement)
  // Save evidence before asserting, including the actual failed text geometry.
  await page.screenshot({ path: join(output, `${name}.png`) })
  await page.locator('.host-selection').screenshot({ path: join(output, `${name}-actions.png`) })
  assertSelectionActions(actions)
  return measurement
}

export async function checkMinimumSidebar(context, size) {
  const { page, report } = context
  const original = await sidebarGeometry(page)
  await captureSelectionActions(context, `sidebar-ui-${size}-normal`)
  const group = await page.locator('.main-panels').boundingBox()
  assert.ok(group, 'Required panel group must be visible')
  try {
    // Drag past the allowed minimum so react-resizable-panels clamps it itself.
    await dragSidebar(page, group.x + 1)
    const minimum = await sidebarGeometry(page)
    assert.ok(minimum.minimumPercentage > 0, 'Resize handle must expose its actual minimum')
    assert.ok(Math.abs(minimum.percentage - minimum.minimumPercentage) <= 0.01,
      `Sidebar did not reach its allowed minimum: ${JSON.stringify(minimum)}`)
    await captureSelectionActions(context, `sidebar-ui-${size}-minimum`)
  } finally {
    await dragSidebar(page, original.handleX)
    const restored = await sidebarGeometry(page)
    ;(report.ui.sidebarRestoration ??= []).push({ size, original, restored,
      widthDelta: restored.sidebarWidth - original.sidebarWidth,
      handleDelta: restored.handleX - original.handleX })
    assert.ok(Math.abs(restored.sidebarWidth - original.sidebarWidth) <= 0.5,
      `Sidebar width not restored: ${JSON.stringify({ original, restored })}`)
    assert.ok(Math.abs(restored.handleX - original.handleX) <= 0.5, 'Sidebar handle not restored')
  }
  await captureSelectionActions(context, `sidebar-ui-${size}-restored`)
}
