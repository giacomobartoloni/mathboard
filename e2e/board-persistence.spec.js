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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { test, expect } from '@playwright/test'
import { gotoBoard } from './fixtures.js'
import { selectShape, selectTool } from './helpers/board.js'
import { clickOnCanvas, dragOnCanvas, getBoardState, safeDrag, waitForState } from './helpers/canvas.js'

async function flushPersistence(page) {
  await page.evaluate(async () => {
    await window.__MATHBOARD_E2E__.flushPersistence()
  })
}

async function restoreBoard(page, boardId) {
  await page.evaluate((id) => {
    sessionStorage.setItem('mathboard.e2e.restoreBoardId', id)
  }, boardId)
  await page.reload()
  await page.waitForFunction(() => window.__MATHBOARD_E2E__?.getState?.()?.boardId)
}

async function createText(page, value) {
  await selectTool(page, 'Text')
  await clickOnCanvas(page, { x: 320, y: 220 })
  const textarea = page.locator('textarea').first()
  await expect(textarea).toBeAttached()
  await textarea.fill(value)
  await page.keyboard.press('Escape')
  return waitForState(page, (s) => s.objects.some((o) => o.type === 'IText' && o.text === value))
}

test('E2E persistence: formula keeps identity and latex across reload', async ({ page }) => {
  await gotoBoard(page)
  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 340, y: 240 })
  const latexInput = page.getByLabel('LaTeX Formula:')
  await latexInput.fill('x^2+1')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()

  let state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.latex === 'x^2+1' && o.isVectorFormula),
    { timeout: 15000 },
  )
  const boardId = state.boardId
  const formulaId = state.objects.find((o) => o.latex === 'x^2+1').mathboardId
  await flushPersistence(page)
  await restoreBoard(page, boardId)

  state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.latex === 'x^2+1' && o.mathboardId === formulaId),
    { timeout: 15000 },
  )
  const formula = state.objects.find((o) => o.mathboardId === formulaId)
  expect(formula.isVectorFormula).toBe(true)
  expect(formula.latex).toBe('x^2+1')

  await clickOnCanvas(page, { x: Math.round(formula.left + formula.width / 2), y: Math.round(formula.top + formula.height / 2), clickCount: 2 })
  await latexInput.fill('x^2+2')
  await page.getByRole('button', { name: 'Update', exact: true }).click()
  state = await waitForState(page, (s) => s.objects.some((o) => o.latex === 'x^2+2' && o.mathboardId === formulaId))
  await flushPersistence(page)
  await restoreBoard(page, boardId)
  state = await waitForState(page, (s) => s.objects.some((o) => o.latex === 'x^2+2' && o.mathboardId === formulaId))
  expect(state.history.length).toBe(0)
})

test('E2E persistence: autosave reload preserves a pen stroke and starts a fresh history', async ({ page }) => {
  await gotoBoard(page, '/', { preserveLastBoardId: true })
  const initial = await getBoardState(page)
  await selectTool(page, 'Pen')
  await dragOnCanvas(page, safeDrag())

  let state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Path'))
  expect(state.history.length).toBeGreaterThan(0)
  const originalPath = state.objects.find((o) => o.type === 'Path')
  const pathId = originalPath.mathboardId
  expect(pathId).toMatch(/^mbobj_/)
  const boardId = state.boardId
  expect(boardId).toMatch(/^mb_/)

  state = await waitForState(page, (s) => (
    s.persistence?.state === 'clean'
    && s.persistence.lastSavedAt
    && s.persistence.lastSavedAt !== initial.persistence?.lastSavedAt
  ), { timeout: 15000 })
  const savedAt = state.persistence.lastSavedAt
  await page.reload()
  await page.waitForFunction(() => window.__MATHBOARD_E2E__?.getState?.()?.boardId)

  state = await waitForState(page, (s) => s.objects.some((o) => o.mathboardId === pathId))
  expect(state.boardId).toBe(boardId)
  const restoredPath = state.objects.find((o) => o.mathboardId === pathId)
  expect(restoredPath.type).toBe('Path')
  for (const property of ['left', 'top', 'width', 'height']) {
    expect(restoredPath[property]).toBeCloseTo(originalPath[property], 2)
  }
  expect(state.persistence.lastSavedAt).toBe(savedAt)
  expect(state.history.length).toBe(0)

  await selectTool(page, 'Pen')
  await dragOnCanvas(page, { x1: 460, y1: 180, x2: 540, y2: 260 })
  state = await waitForState(page, (s) => (
    s.objects.filter((o) => o.type === 'Path').length === 2
    && s.history.length > 0
  ))
  expect(state.boardId).toBe(boardId)
  expect(state.objects.some((o) => o.mathboardId === pathId)).toBe(true)
})

test('E2E persistence: zoom does not dirty the document', async ({ page }) => {
  await gotoBoard(page)
  const before = await getBoardState(page)
  expect(before.persistence?.state).toBe('clean')

  await page.locator('button[title="Zoom In (Ctrl+=)"]').click()
  await page.waitForTimeout(200)
  const after = await getBoardState(page)
  expect(after.zoom).toBeGreaterThan(before.zoom)
  expect(after.persistence?.state).toBe('clean')
})

test('E2E persistence: active selection stores member canvas geometry', async ({ page }) => {
  await gotoBoard(page)
  await selectShape(page, 'Rectangle')
  await dragOnCanvas(page, { x1: 280, y1: 160, x2: 360, y2: 230 })
  await selectShape(page, 'Circle')
  await dragOnCanvas(page, { x1: 420, y1: 190, x2: 480, y2: 250 })
  await waitForState(page, (s) => s.objects.length === 2)

  await selectTool(page, 'Select')
  await page.keyboard.press('ControlOrMeta+A')
  let state = await waitForState(
    page,
    (s) => s.active.type === 'ActiveSelection' && s.active.selectionCount === 2,
  )
  const objects = state.objects
  const center = {
    x: Math.round((Math.min(...objects.map((o) => o.left)) + Math.max(...objects.map((o) => o.left + o.width))) / 2),
    y: Math.round((Math.min(...objects.map((o) => o.top)) + Math.max(...objects.map((o) => o.top + o.height))) / 2),
  }
  await dragOnCanvas(page, { x1: center.x, y1: center.y, x2: center.x + 60, y2: center.y + 40 })
  state = await waitForState(page, (s) => s.active.type === 'ActiveSelection')

  const boardId = state.boardId
  const expected = new Map(state.objects.map((object) => [object.mathboardId, object]))
  expect([...expected.keys()]).not.toContain(null)
  await flushPersistence(page)
  await restoreBoard(page, boardId)

  const restored = await getBoardState(page)
  expect(restored.active.type).not.toBe('ActiveSelection')
  for (const object of restored.objects) {
    const before = expected.get(object.mathboardId)
    expect(before).toBeTruthy()
    expect(object.left).toBeCloseTo(before.left, 2)
    expect(object.top).toBeCloseTo(before.top, 2)
    expect(object.scaleX).toBeCloseTo(before.scaleX, 3)
    expect(object.scaleY).toBeCloseTo(before.scaleY, 3)
    expect(object.angle).toBeCloseTo(before.angle, 3)
  }
})

test('E2E persistence: flush defers while text editing is active', async ({ page }) => {
  await gotoBoard(page)
  let state = await createText(page, 'before')
  const text = state.objects.find((object) => object.type === 'IText' && object.text === 'before')
  await flushPersistence(page)

  await selectShape(page, 'Rectangle')
  await dragOnCanvas(page, { x1: 430, y1: 180, x2: 480, y2: 230 })
  await waitForState(page, (s) => s.persistence?.state === 'dirty')
  await selectTool(page, 'Select')
  await clickOnCanvas(page, {
    x: Math.round(text.left + text.width / 2),
    y: Math.round(text.top + text.height / 2),
    clickCount: 2,
  })
  await expect(page.locator('textarea').first()).toBeAttached()

  await flushPersistence(page)
  state = await getBoardState(page)
  expect(state.persistence.state).toBe('dirty')

  await page.locator('textarea').first().fill('after')
  await page.keyboard.press('Escape')
  await flushPersistence(page)
  await waitForState(page, (s) => s.persistence?.state === 'clean')
  await restoreBoard(page, state.boardId)
  await waitForState(page, (s) => s.objects.some((object) => object.mathboardId === text.mathboardId && object.text === 'after'))
})
