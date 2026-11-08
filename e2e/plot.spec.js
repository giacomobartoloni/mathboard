/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { test, expect } from '@playwright/test'
import { gotoBoard } from './fixtures.js'
import { getBoardState, waitForState, clickOnCanvas } from './helpers/canvas.js'
import { clickUndo, clickRedo } from './helpers/board.js'

async function openGraph(page) {
  await page.getByRole('button', { name: 'Graph', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Graph', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const narrow = page.viewportSize().width <= 600
  await clickOnCanvas(page, narrow ? { x: 80, y: 220 } : { x: 320, y: 180 })
  await expect(page.getByRole('dialog', { name: 'Create graph' })).toBeVisible()
}
async function insertGraph(page, latex = 'x^2-5x+6') {
  await openGraph(page)
  await page.getByLabel('Function (LaTeX)').fill(latex)
  await expect(page.getByRole('button', { name: 'Insert graph', exact: true })).toBeEnabled({
    timeout: 20000
  })
  await page.getByRole('button', { name: 'Insert graph', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  return waitForState(page, (s) => s.objects.some((o) => o.objectKind === 'plot'))
}
async function editGraph(page, plot) {
  await clickOnCanvas(page, {
    x: Math.round(plot.left + plot.width / 2),
    y: Math.round(plot.top + plot.height / 2),
    clickCount: 2
  })
  await expect(page.getByRole('dialog', { name: 'Edit graph' })).toBeVisible()
}

test('graph create/edit is atomic, undoable, persistent and retains mathematical bounds', async ({
  page
}) => {
  // Exercise the real app and its dedicated worker without unsafe-eval.
  await page.route('http://127.0.0.1:4173/', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(),
      'content-security-policy': "script-src 'self'; worker-src 'self'" } })
  })
  await gotoBoard(page)
  let state = await insertGraph(page),
    p = state.objects.find((o) => o.objectKind === 'plot')
  expect(state.history.tipType).toBe('add')
  expect(p.plotSpec.mathWindow).toEqual({ xMin: -6, xMax: 6, yMin: -4, yMax: 4 })
  await clickUndo(page)
  await waitForState(page, (s) => s.objects.length === 0)
  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.objectKind === 'plot'))
  p = state.objects[0]
  await editGraph(page, p)
  await page.getByLabel('Function (LaTeX)').fill('\\sin(x)')
  await page.getByLabel('X minimum').fill('-3')
  await page.getByLabel('X maximum').fill('3')
  await expect(page.getByRole('button', { name: 'Update graph', exact: true })).toBeEnabled({
    timeout: 20000
  })
  await page.getByRole('button', { name: 'Update graph', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  state = await waitForState(
    page,
    (s) => s.history.tipType === 'replace' && s.objects[0].plotSpec.latex === '\\sin(x)'
  )
  expect(state.objects).toHaveLength(1)
  await clickUndo(page)
  await waitForState(page, (s) => s.objects[0].plotSpec.latex === 'x^2-5x+6')
  await clickRedo(page)
  await waitForState(page, (s) => s.objects[0].plotSpec.latex === '\\sin(x)')
  await expect
    .poll(
      async () => {
        const s = await getBoardState(page)
        return s.persistence?.state
      },
      { timeout: 10000 }
    )
    .toBe('clean')
  await page.reload()
  await expect(page.getByRole('status', { name: 'Loading board' })).toHaveCount(0)
  state = await waitForState(page, (s) => s.objects.some((o) => o.objectKind === 'plot'))
  expect(state.objects[0].plotSpec.latex).toBe('\\sin(x)')
  expect(state.objects[0].plotSpec.mathWindow.xMin).toBe(-3)
})

test('invalid graph edit keeps original object and allows correction or cancellation', async ({
  page
}) => {
  await gotoBoard(page)
  const state = await insertGraph(page)
  await editGraph(page, state.objects[0])
  await page.getByLabel('Function (LaTeX)').fill('x+y')
  await expect(page.getByRole('alert')).toContainText(/supported|variable|Only x/, {
    timeout: 20000
  })
  await expect(page.getByRole('button', { name: 'Update graph', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const after = await getBoardState(page)
  expect(after.objects[0].plotSpec.latex).toBe('x^2-5x+6')
  expect(after.history.length).toBe(state.history.length)
  await expect(page.getByRole('button', { name: 'Graph', exact: true })).toBeFocused()
})

test('graph editor fits 390px, supports keyboard and validates bounds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoBoard(page)
  await openGraph(page)
  await expect(page.getByLabel('Function (LaTeX)')).toBeFocused()
  await page.getByLabel('X maximum').fill('-7')
  await expect(page.getByRole('alert')).toContainText(/bounds|minimum|ordered/)
  await expect(page.getByRole('button', { name: 'Insert graph', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const [theme, width, height] of [
  ['light', 1280, 800],
  ['dark', 390, 844]
]) {
  test(`graph visual reference and fixed-curve theme behavior ${theme}`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width, height })
    await gotoBoard(page, '/', { boardTheme: theme })
    await openGraph(page)
    await page.getByLabel('Curve color').selectOption('#2563eb')
    await expect(page.getByRole('button', { name: 'Insert graph', exact: true })).toBeEnabled({
      timeout: 20000
    })
    await page.screenshot({ path: testInfo.outputPath(`graph-editor-${theme}.png`) })
    await page.getByRole('button', { name: 'Insert graph', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const state = await waitForState(page, (s) => s.objects.some((o) => o.objectKind === 'plot'))
    expect(state.objects[0].inkMode).toBe('fixed')
    const graph = state.objects[0]
    expect(graph.left).toBeGreaterThanOrEqual(70)
    expect(graph.left + graph.width * graph.scaleX).toBeLessThanOrEqual(width - 12)
    expect(graph.top + graph.height * graph.scaleY).toBeLessThanOrEqual(height - 90)
    await page.screenshot({ path: testInfo.outputPath(`graph-board-${theme}.png`) })
  })
}


for (const [theme, background, cssColor] of [
  ['light', '#f9f9f9', 'rgb(249, 249, 249)'],
  ['dark', '#1e1e22', 'rgb(30, 30, 34)'],
  ['chalkboard', '#244a3b', 'rgb(36, 74, 59)']
]) {
  for (const grid of [true, false]) {
    test(`opaque graph surface ${theme}, grid ${grid}`, async ({ page }, testInfo) => {
      await gotoBoard(page, '/', { boardTheme: theme })
      await openGraph(page)
      if (!grid) await page.getByLabel('Grid', { exact: true }).uncheck()
      await expect(page.getByRole('button', { name: 'Insert graph', exact: true })).toBeEnabled({ timeout: 20000 })
      await expect(page.getByRole('img', { name: 'Graph of x^2-5x+6' }).locator('..')).toHaveCSS('background-color', cssColor)
      await page.getByRole('button', { name: 'Insert graph', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      const state = await waitForState(page, s => s.objects.some(o => o.objectKind === 'plot'))
      expect(state.objects[0].plotBackground).toEqual({ fill: background, opacity: 1 })
      expect(state.objects[0].plotSpec.grid).toBe(grid)
      await page.screenshot({ path: testInfo.outputPath(`opaque-${theme}-${grid}.png`) })
    })
  }
}

test('opaque graph follows live themes, duplication and reload without an internal grid', async ({ page }) => {
  // The fixture reapplies its seeded theme on reload; finish the cycle on that theme.
  await gotoBoard(page, '/', { boardTheme: 'chalkboard' })
  await openGraph(page)
  await page.getByLabel('Grid', { exact: true }).uncheck()
  await expect(page.getByRole('button', { name: 'Insert graph', exact: true })).toBeEnabled({ timeout: 20000 })
  await page.getByRole('button', { name: 'Insert graph', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const [name, color] of [['Chalkboard','#f9f9f9'],['Light','#1e1e22'],['Dark','#244a3b']]) {
    await page.getByRole('button', { name: new RegExp('Theme: '+name) }).click()
    await waitForState(page, s => s.objects[0]?.plotBackground?.fill === color)
  }
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await waitForState(page, s => s.objects.length === 2 && s.objects.every(o => o.plotBackground?.fill === '#244a3b'))
  await expect.poll(async () => (await getBoardState(page)).persistence.state).toBe('clean')
  await page.reload()
  const restored = await waitForState(page, s => s.objects.length === 2)
  expect(restored.objects.every(o => o.plotBackground?.fill === '#244a3b' && o.plotBackground.opacity === 1 && o.plotSpec.grid === false)).toBe(true)
})

test('G arms graph placement, a board click sets its origin, and insertion is one-shot', async ({ page }) => {
  await gotoBoard(page)
  await page.keyboard.press('g')
  await expect(page.getByRole('button', { name: 'Graph', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await clickOnCanvas(page, { x: 420, y: 230 })
  await expect(page.getByRole('dialog', { name: 'Create graph' })).toBeVisible()
  await page.getByLabel('Function (LaTeX)').fill('')
  await page.getByLabel('Function (LaTeX)').pressSequentially('g')
  await expect(page.getByRole('dialog', { name: 'Create graph' })).toBeVisible()
  await expect(page.getByLabel('Function (LaTeX)')).toHaveValue('g')
  await page.getByLabel('Function (LaTeX)').fill('x^2')
  await expect(page.getByRole('button', { name: 'Insert graph', exact: true })).toBeEnabled({ timeout: 20000 })
  await page.getByRole('button', { name: 'Insert graph', exact: true }).click()
  const state = await waitForState(page, s => s.objects.length === 1)
  expect(state.objects[0].left).toBeCloseTo(420, 5)
  expect(state.objects[0].top).toBeCloseTo(230, 5)
  expect(state.history.length).toBe(1)
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await clickOnCanvas(page, { x: 250, y: 150 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('graph placement uses scene coordinates after zoom and pan', async ({ page }) => {
  await gotoBoard(page)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Pan', exact: true }).click()
  const canvas = await page.locator('canvas.upper-canvas').boundingBox()
  await page.mouse.move(canvas.x + 300, canvas.y + 180)
  await page.mouse.down(); await page.mouse.move(canvas.x + 360, canvas.y + 220); await page.mouse.up()
  const before = await getBoardState(page), v = before.viewportTransform
  await page.keyboard.press('g')
  await clickOnCanvas(page, { x: 410, y: 210 })
  await expect(page.getByRole('dialog', { name: 'Create graph' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Insert graph', exact: true })).toBeEnabled({ timeout: 20000 })
  await page.getByRole('button', { name: 'Insert graph', exact: true }).click()
  const state = await waitForState(page, s => s.objects.length === 1)
  expect(state.objects[0].left).toBeCloseTo((410-v[4])/v[0], 5)
  expect(state.objects[0].top).toBeCloseTo((210-v[5])/v[3], 5)
})

test('Escape and switching tools cancel graph placement without stale click handlers', async ({ page }) => {
  await gotoBoard(page)
  await page.keyboard.press('g'); await page.keyboard.press('Escape')
  await clickOnCanvas(page, { x: 320, y: 180 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('g')
  await page.getByRole('button', { name: 'Formula', exact: true }).click()
  await clickOnCanvas(page, { x: 320, y: 180 })
  await expect(page.getByRole('heading', { name: 'Insert Formula (LaTeX)' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('g')
  await clickOnCanvas(page, { x: 320, y: 180 })
  await expect(page.getByRole('dialog', { name: 'Create graph' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await clickOnCanvas(page, { x: 320, y: 180 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await getBoardState(page)).objects).toHaveLength(0)
})

test('border option works in create/edit, preserves the opaque surface and survives history/reload', async ({ page }, testInfo) => {
  await gotoBoard(page)
  await openGraph(page)
  await expect(page.getByLabel('Border', { exact: true })).toBeChecked()
  await page.getByLabel('Border', { exact: true }).uncheck()
  await expect(page.getByLabel('Grid', { exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Insert graph', exact: true })).toBeEnabled({ timeout: 20000 })
  await expect(page.getByRole('img', { name: 'Graph of x^2-5x+6' }).locator('path[opacity="0.14"]')).toHaveCount(12)
  await expect(page.getByRole('img', { name: 'Graph of x^2-5x+6' }).locator('..')).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
  const insertBox = await page.getByRole('button', { name: 'Insert graph', exact: true }).boundingBox()
  const dialogBox = await page.getByRole('dialog', { name: 'Create graph' }).boundingBox()
  expect(insertBox.y + insertBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height)
  await page.screenshot({ path: testInfo.outputPath('graph-borderless-editor.png') })
  await page.getByRole('button', { name: 'Insert graph', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  let state = await waitForState(page, s => s.objects.length === 1)
  expect(state.objects[0].plotSpec.border).toBe(false)
  expect(state.objects[0].plotSpec.grid).toBe(true)
  expect(state.objects[0].plotBorder).toBe(false)
  expect(state.objects[0].plotBackground).toEqual({ fill: '#f9f9f9', opacity: 1 })
  await clickOnCanvas(page, { x: 220, y: 120 })
  await page.screenshot({ path: testInfo.outputPath('graph-borderless-board.png') })
  await editGraph(page, state.objects[0])
  await expect(page.getByLabel('Border', { exact: true })).not.toBeChecked()
  await page.getByLabel('Border', { exact: true }).check()
  await expect(page.getByRole('button', { name: 'Update graph', exact: true })).toBeEnabled({ timeout: 20000 })
  await page.getByRole('button', { name: 'Update graph', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await waitForState(page, s => s.objects[0].plotBorder === true && s.history.tipType === 'replace')
  await clickUndo(page)
  await waitForState(page, s => s.objects[0].plotBorder === false && s.objects[0].plotSpec.border === false)
  await clickRedo(page)
  await waitForState(page, s => s.objects[0].plotBorder === true)
  await expect.poll(async () => (await getBoardState(page)).persistence.state).toBe('clean')
  await page.reload()
  state = await waitForState(page, s => s.objects.length === 1)
  expect(state.objects[0].plotSpec.border).toBe(true)
  expect(state.objects[0].plotBorder).toBe(true)
})

for (const [theme, width, height] of [['light', 1280, 800], ['dark', 390, 844]]) {
  test(`axis numbers toggle preserves axes and survives create/edit/history/reload ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height })
    await gotoBoard(page, '/', { boardTheme: theme })
    await openGraph(page)
    const numbers = page.getByLabel('Axis numbers', { exact: true })
    const preview = page.getByRole('img', { name: 'Graph of x^2-5x+6' })
    await expect(numbers).toBeChecked()
    await numbers.uncheck()
    await page.getByLabel('Axes', { exact: true }).uncheck()
    await expect(numbers).toBeDisabled()
    await page.getByLabel('Axes', { exact: true }).check()
    await expect(numbers).toBeEnabled()
    await expect(numbers).not.toBeChecked()
    await expect(page.getByRole('button', { name: 'Insert graph', exact: true })).toBeEnabled({ timeout: 20000 })
    await expect(preview.locator('text')).toHaveCount(0)
    await expect(preview.locator('path[opacity="0.65"]')).toHaveCount(2)
    await expect(preview.locator('path[opacity="0.14"]')).toHaveCount(12)
    await page.screenshot({ path: testInfo.outputPath(`graph-no-axis-numbers-editor-${theme}.png`) })
    await page.getByRole('button', { name: 'Insert graph', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    let state = await waitForState(page, s => s.objects.length === 1)
    expect(state.objects[0].plotSpec.axisNumbers).toBe(false)
    expect(state.objects[0].plotSpec.axes).toBe(true)
    expect(state.objects[0].plotAxisNumberCount).toBe(0)
    await expect.poll(async () => (await getBoardState(page)).persistence.state).toBe('clean')
    await page.reload()
    state = await waitForState(page, s => s.objects.length === 1)
    expect(state.objects[0].plotAxisNumberCount).toBe(0)
    await editGraph(page, state.objects[0])
    await expect(numbers).not.toBeChecked()
    await numbers.check()
    await expect(page.getByRole('button', { name: 'Update graph', exact: true })).toBeEnabled({ timeout: 20000 })
    await expect(preview.locator('text')).not.toHaveCount(0)
    await page.getByRole('button', { name: 'Update graph', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await waitForState(page, s => s.objects[0].plotAxisNumberCount > 0 && s.history.tipType === 'replace')
    await clickUndo(page)
    await waitForState(page, s => s.objects[0].plotSpec.axisNumbers === false && s.objects[0].plotAxisNumberCount === 0)
    await clickRedo(page)
    await waitForState(page, s => s.objects[0].plotSpec.axisNumbers === true && s.objects[0].plotAxisNumberCount > 0)
  })
}
