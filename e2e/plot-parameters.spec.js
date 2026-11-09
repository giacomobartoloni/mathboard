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
import { clickOnCanvas, getBoardState, waitForState } from './helpers/canvas.js'
import { clickUndo } from './helpers/board.js'

async function createParameterizedPlot(page, showControls) {
  await page.getByRole('button', { name: 'Graph', exact: true }).click()
  await clickOnCanvas(page, { x: 320, y: 180 })
  await expect(page.getByRole('dialog', { name: 'Create graph' })).toBeVisible()
  await page.getByLabel('Function (LaTeX)').fill('ax^2+bx+c')
  await expect(page.getByRole('button', { name: 'Add sliders for a, b, c' })).toBeVisible()
  await page.getByRole('button', { name: 'Add sliders for a, b, c' }).click()
  if (showControls) await page.getByRole('checkbox', { name: 'Show parameter controls on board' }).check()
  await expect(page.getByRole('button', { name: 'Insert graph' })).toBeEnabled({ timeout: 20000 })
  await page.getByRole('button', { name: 'Insert graph' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  return waitForState(page, s => s.objects.some(o => o.objectKind === 'plot' && o.plotSpec.parameters?.length === 3))
}

test('parametric graph controls are independent of selection, below the plot and persist on reload', async ({ page }) => {
  await gotoBoard(page)
  const initial = await createParameterizedPlot(page, true)
  const graph = initial.objects.find(o => o.objectKind === 'plot')
  const panel = page.getByRole('region', { name: /Parameters for graph/ })
  await expect(panel).toBeVisible()
  await clickOnCanvas(page, { x: 60, y: 110 })
  await expect(panel).toBeVisible()
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await expect(panel).toBeVisible()
  const canvasBox = await page.locator('canvas.upper-canvas').boundingBox()
  const rackBox = await panel.boundingBox()
  expect(rackBox.y).toBeGreaterThan(canvasBox.y + graph.top)
  await expect.poll(async () => (await getBoardState(page)).objects.find(o => o.objectKind === 'plot').plotSpec.showParameterControls).toBe(true)
  await expect.poll(async () => (await getBoardState(page)).persistence?.state, { timeout: 10000 }).toBe('clean')
  await page.reload()
  await expect(panel).toBeVisible()
  const restored = await getBoardState(page)
  expect(restored.objects[0].plotSpec.showParameterControls).toBe(true)
})

test('contextual button toggles panel without editing and slider gesture makes one history entry', async ({ page }) => {
  await gotoBoard(page)
  const state = await createParameterizedPlot(page, false)
  await expect(page.getByRole('region', { name: /Parameters for graph/ })).toHaveCount(0)
  const graph = state.objects.find(o => o.objectKind === 'plot')
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await clickOnCanvas(page, {
    x: Math.round(graph.left + graph.width * graph.scaleX / 2),
    y: Math.round(graph.top + graph.height * graph.scaleY / 2)
  })
  await page.getByRole('button', { name: 'Show parameter controls' }).click()
  const panel = page.getByRole('region', { name: /Parameters for graph/ })
  await expect(panel).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hide parameter controls' })).toBeVisible()
  const start = await getBoardState(page)
  const slider = page.getByRole('slider', { name: 'Parameter a' })
  await slider.focus()
  await slider.press('ArrowRight')
  await slider.press('Tab')
  const changed = await waitForState(page, s => s.objects[0].plotSpec.parameters?.[0]?.value > 1)
  expect(changed.history.length).toBe(start.history.length + 1)
  await clickUndo(page)
  await waitForState(page, s => s.objects[0].plotSpec.parameters?.[0]?.value === 1)
  await page.getByRole('button', { name: 'Hide parameter controls' }).click()
  await expect(panel).toHaveCount(0)
  const hidden = await getBoardState(page)
  expect(hidden.objects[0].plotSpec.parameters).toHaveLength(3)
})
