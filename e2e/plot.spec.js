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
