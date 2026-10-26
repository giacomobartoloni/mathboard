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
import { selectTool, selectShape, clickUndo, clickRedo, insertStamp } from './helpers/board.js'
import { clickOnCanvas, dragOnCanvas, getBoardState, waitForState } from './helpers/canvas.js'

test('UI Formula no-op has no committed effect while agent and UI creates keep distinct channels', async ({ page }) => {
  await gotoBoard(page)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.startAnalyticsCapture())).toBe(true)

  await page.evaluate(() => window.__MATHBOARD_E2E__.createObjects([{ type: 'rect', left: 30, top: 30, width: 40, height: 30 }]))
  let effects = await page.evaluate(() => window.__MATHBOARD_E2E__.takeAnalyticsEffects())
  expect(effects).toEqual([{ effect: { kind: 'create', objectKinds: ['shape'] }, context: { interactionChannel: 'local_agent' } }])

  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 340, y: 240 })
  const input = page.getByLabel('LaTeX Formula:')
  await input.fill('x^2')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  const state = await waitForState(page, (s) => s.objects.some((o) => o.latex === 'x^2'), { timeout: 15000 })
  effects = await page.evaluate(() => window.__MATHBOARD_E2E__.takeAnalyticsEffects())
  expect(effects).toEqual([{ effect: { kind: 'create', objectKinds: ['formula'] }, context: { interactionChannel: 'ui' } }])

  const formula = state.objects.find((object) => object.latex === 'x^2')
  await clickOnCanvas(page, {
    x: Math.round(formula.left + (formula.width || 40) / 2),
    y: Math.round(formula.top + (formula.height || 40) / 2),
    clickCount: 2,
  })
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Update', exact: true }).click()
  const after = await getBoardState(page)
  expect(after.history.length).toBe(state.history.length)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.takeAnalyticsEffects())).toEqual([])
})

test('direct UI gestures report one committed effect per path, shape, group, history and deletion', async ({ page }) => {
  await gotoBoard(page)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.startAnalyticsCapture())).toBe(true)

  await selectTool(page, 'Pen')
  await dragOnCanvas(page, { x1: 280, y1: 180, x2: 360, y2: 230 })
  await waitForState(page, (s) => s.objects.some((o) => o.type === 'Path'))
  await selectShape(page, 'Rectangle')
  await dragOnCanvas(page, { x1: 430, y1: 210, x2: 500, y2: 270 })
  await waitForState(page, (s) => s.objects.some((o) => o.type === 'Rect'))
  let effects = await page.evaluate(() => window.__MATHBOARD_E2E__.takeAnalyticsEffects())
  expect(effects).toEqual([
    { effect: { kind: 'create', objectKinds: ['path'] }, context: { interactionChannel: 'ui' } },
    { effect: { kind: 'create', objectKinds: ['shape'], shape: 'rectangle' }, context: { interactionChannel: 'ui' } },
  ])

  await selectTool(page, 'Select')
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+G')
  await waitForState(page, (s) => s.history.tipType === 'group' && s.objects.length === 1)
  await clickUndo(page)
  await waitForState(page, (s) => s.objects.length === 2)
  await clickRedo(page)
  await waitForState(page, (s) => s.objects.length === 1)
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Delete')
  await waitForState(page, (s) => s.objects.length === 0)
  effects = await page.evaluate(() => window.__MATHBOARD_E2E__.takeAnalyticsEffects())
  expect(effects).toEqual([
    { effect: { kind: 'group' }, context: { interactionChannel: 'ui' } },
    { effect: { kind: 'undo', commandType: 'group' }, context: { interactionChannel: 'ui' } },
    { effect: { kind: 'redo', commandType: 'group' }, context: { interactionChannel: 'ui' } },
    { effect: { kind: 'delete', objectKinds: ['group'] }, context: { interactionChannel: 'ui' } },
  ])
})

test('text commit and stamp insertion report approved categories once', async ({ page }) => {
  await gotoBoard(page)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.startAnalyticsCapture())).toBe(true)

  await selectTool(page, 'Text')
  await clickOnCanvas(page, { x: 320, y: 220 })
  const textarea = page.locator('textarea').first()
  await textarea.fill('example')
  await page.keyboard.press('Escape')
  await waitForState(page, (s) => s.objects.some((o) => o.text === 'example'))
  await insertStamp(page, 'Cartesian plane')
  await waitForState(page, (s) => s.objects.some((o) => o.type === 'Group'))
  const effects = await page.evaluate(() => window.__MATHBOARD_E2E__.takeAnalyticsEffects())
  expect(effects).toEqual([
    { effect: { kind: 'create', objectKinds: ['text'] }, context: { interactionChannel: 'ui' } },
    { effect: { kind: 'create', objectKinds: ['stamp'] }, context: { interactionChannel: 'ui' } },
  ])
})
