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

async function gotoWithAnalyticsCapture(page) {
  await page.route('https://mathboard.app:4173/**', async (route) => {
    const requested = new URL(route.request().url())
    const localUrl = `http://127.0.0.1:4173${requested.pathname}${requested.search}`
    const response = await route.fetch({ url: localUrl })
    await route.fulfill({ response })
  })
  await page.addInitScript(() => {
    window.__capturedProductEvents = []
    window.sa_event = (name, metadata) => window.__capturedProductEvents.push({ name, metadata })
  })
  await gotoBoard(page, 'https://mathboard.app:4173/')
}

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

test('an accepted UI group still reports its effect when the panel refresh fails', async ({ page }) => {
  await gotoBoard(page)
  await page.evaluate(() => window.__MATHBOARD_E2E__.createObjects([
    { type: 'rect', left: 280, top: 180, width: 60, height: 40 },
    { type: 'rect', left: 440, top: 180, width: 60, height: 40 },
  ]))
  await page.keyboard.press('ControlOrMeta+A')
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.startAnalyticsCapture())).toBe(true)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.failNextPanelRefreshForCommand('group'))).toBe(true)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.groupSelection())).toBe(true)
  const state = await getBoardState(page)
  expect(state.history.tipType).toBe('group')
  expect(state.objects).toHaveLength(1)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.takeAnalyticsEffects())).toEqual([
    { effect: { kind: 'group' }, context: { interactionChannel: 'ui' } },
  ])
})

test('overlapping UI and agent Formula renders retain their own trusted channel', async ({ page }) => {
  await gotoBoard(page)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.startAnalyticsCapture())).toBe(true)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.holdFormulaRenders())).toBe(true)

  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 320, y: 220 })
  const input = page.getByLabel('LaTeX Formula:')
  await input.fill('x^2')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__MATHBOARD_E2E__.pendingFormulaRenders())).toBe(1)

  await page.evaluate(() => {
    window.__agentFormulaPromise = window.__MATHBOARD_E2E__.createObjects([
      { type: 'formula', latex: 'y^2', left: 510, top: 220 },
    ])
  })
  await expect.poll(() => page.evaluate(() => window.__MATHBOARD_E2E__.pendingFormulaRenders())).toBe(2)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.releaseFormulaRender(1))).toBe(true)
  await page.evaluate(() => window.__agentFormulaPromise)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.takeAnalyticsEffects())).toEqual([
    { effect: { kind: 'create', objectKinds: ['formula'] }, context: { interactionChannel: 'local_agent' } },
  ])

  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.releaseFormulaRender(0))).toBe(true)
  await waitForState(page, (s) => s.objects.some((o) => o.latex === 'x^2') && s.objects.some((o) => o.latex === 'y^2'))
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.takeAnalyticsEffects())).toEqual([
    { effect: { kind: 'create', objectKinds: ['formula'] }, context: { interactionChannel: 'ui' } },
  ])
})

test('an undo still reports the applied replay when persistence notification fails', async ({ page }) => {
  await gotoBoard(page)
  await page.evaluate(() => window.__MATHBOARD_E2E__.createObjects([
    { type: 'rect', left: 280, top: 180, width: 60, height: 40 },
  ]))
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.startAnalyticsCapture())).toBe(true)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.failNextDocumentChange())).toBe(true)
  await expect(page.evaluate(() => window.__MATHBOARD_E2E__.undoBoard()))
    .rejects.toThrow(/Injected document-change failure/)
  const state = await getBoardState(page)
  expect(state.objects).toHaveLength(0)
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.takeAnalyticsEffects())).toEqual([
    { effect: { kind: 'undo', commandType: 'batch-add' }, context: { interactionChannel: 'ui' } },
  ])
})

test('production analytics adapter keeps Formula submit but drops same-value committed events', async ({ page }) => {
  await gotoWithAnalyticsCapture(page)

  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 340, y: 240 })
  const input = page.getByLabel('LaTeX Formula:')
  await input.fill('x^2')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  const state = await waitForState(page, (s) => s.objects.some((o) => o.latex === 'x^2'), { timeout: 15000 })
  const formula = state.objects.find((object) => object.latex === 'x^2')
  await clickOnCanvas(page, {
    x: Math.round(formula.left + (formula.width || 40) / 2),
    y: Math.round(formula.top + (formula.height || 40) / 2),
    clickCount: 2,
  })
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Update', exact: true }).click()

  const events = await page.evaluate(() => window.__capturedProductEvents)
  expect(events.filter(({ name }) => name === 'formula_submitted')).toEqual([
    { name: 'formula_submitted', metadata: { mode: 'create' } },
    { name: 'formula_submitted', metadata: { mode: 'edit' } },
  ])
  expect(events.filter(({ name }) => name === 'object_created')).toEqual([
    { name: 'object_created', metadata: { object_type: 'formula' } },
  ])
  expect(events.filter(({ name }) => name === 'formula_edited')).toEqual([])
  expect(events.filter(({ name }) => name === 'board_engaged')).toHaveLength(1)
})

test('production adapter counts 5/20/50 UI actions without counting agent mutations', async ({ page }) => {
  test.setTimeout(60000)
  await gotoWithAnalyticsCapture(page)
  await page.evaluate(() => window.__MATHBOARD_E2E__.createObjects([
    { type: 'rect', left: 70, top: 70, width: 30, height: 30 },
  ]))
  await selectTool(page, 'Pen')
  for (let index = 0; index < 50; index += 1) {
    const x1 = 280 + (index % 10) * 20
    const y1 = 180 + Math.floor(index / 10) * 35
    await dragOnCanvas(page, { x1, y1, x2: x1 + 12, y2: y1 + 12 })
  }
  const state = await getBoardState(page)
  expect(state.objects.filter(({ type }) => type === 'Path')).toHaveLength(50)
  const events = await page.evaluate(() => window.__capturedProductEvents)
  expect(events.filter(({ name }) => name === 'usage_milestone').map(({ metadata }) => metadata.actions)).toEqual([5, 20, 50])
  expect(events.filter(({ name }) => name === 'board_engaged')).toHaveLength(1)
  expect(events.filter(({ name }) => name === 'object_created')).toHaveLength(51)
})
