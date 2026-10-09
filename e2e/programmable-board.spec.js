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
import { clickUndo, clickRedo, selectTool } from './helpers/board.js'
import { clickOnCanvas, getBoardState, waitForState } from './helpers/canvas.js'

async function callController(page, method, ...args) {
  return page.evaluate(({ method, args }) => window.__MATHBOARD_E2E__[method](...args), { method, args })
}

const specs = [
  { type: 'text', text: 'Equation', left: 300, top: 160, fontSize: 32 },
  { type: 'formula', latex: 'x=1', left: 320, top: 250 },
  { type: 'rect', left: 500, top: 160, width: 80, height: 60, fill: null },
]

test('programmable batch is independent, observed, undoable and persistent', async ({ page }) => {
  await gotoBoard(page)
  await selectTool(page, 'Select')
  const before = await getBoardState(page)
  const nodes = await callController(page, 'createObjects', specs, { select: true })
  let state = await getBoardState(page)
  expect(state.objects).toHaveLength(3)
  expect(nodes.map((node) => node.type)).toEqual(['text', 'formula', 'rect'])
  expect(state.objects[1].isVectorFormula).toBe(true)
  expect(state.history.length).toBe(before.history.length + 1)
  expect(state.history.tipType).toBe('batch-add')
  expect(state.persistence.state).toBe('dirty')
  const ids = nodes.map((node) => node.id)
  expect(new Set(ids).size).toBe(3)

  const observation = await callController(page, 'observeBoard')
  expect(observation.version).toBe(1)
  expect(observation.boardId).toBe(state.boardId)
  expect(observation.selection.ids).toEqual(ids)
  expect(observation.objects.map((node) => node.id)).toEqual(ids)
  expect(observation.objects[1].type).toBe('formula')
  expect(observation.objects[1].latex).toBe('x=1')
  expect(observation.objects[1].objects).toBeUndefined()
  expect(observation.viewport.width).toBeGreaterThan(0)
  for (const node of observation.objects) {
    expect(node.bounds.width).toBeGreaterThan(0)
    expect(node.bounds.height).toBeGreaterThan(0)
  }

  await clickUndo(page)
  await waitForState(page, (s) => s.objects.length === 0)
  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.length === 3)
  expect(state.objects.map((o) => o.mathboardId)).toEqual(ids)
  await callController(page, 'flushPersistence')
  await page.evaluate((boardId) => sessionStorage.setItem('mathboard.e2e.restoreBoardId', boardId), state.boardId)
  await page.reload()
  state = await waitForState(page, (s) => s.objects.length === 3)
  expect(state.objects.map((o) => o.mathboardId)).toEqual(ids)
  expect(state.objects[0].text).toBe('Equation')
  expect(state.objects[1].latex).toBe('x=1')
  expect(state.history.length).toBe(0)
})

test('programmable Formula update rerenders and retains identity through Undo and Redo', async ({ page }) => {
  await gotoBoard(page)
  const [formula] = await callController(page, 'createObjects', [{ ...specs[1], scaleX: 1.4, angle: 25, opacity: 0.6 }])
  const updated = await callController(page, 'updateObject', formula.id, { latex: 'x=2' })
  expect(updated.id).toBe(formula.id)
  expect(updated.scaleX).toBeCloseTo(1.4)
  expect(updated.angle).toBe(25)
  expect(updated.opacity).toBe(0.6)
  let state = await getBoardState(page)
  expect(state.objects[0].isVectorFormula).toBe(true)
  expect(state.history.tipType).toBe('replace')
  expect(state.objects[0].latex).toBe('x=2')
  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects[0]?.latex === 'x=1')
  expect(state.objects[0].mathboardId).toBe(formula.id)
  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects[0]?.latex === 'x=2')
  expect(state.objects[0].mathboardId).toBe(formula.id)
})

test('programmable Text update and delete commit through history', async ({ page }) => {
  await gotoBoard(page)
  const [text, rectangle] = await callController(page, 'createObjects', [specs[0], specs[2]])
  const updated = await callController(page, 'updateObject', text.id, { text: 'Updated', left: 350 })
  expect(updated.id).toBe(text.id)
  expect(updated.text).toBe('Updated')
  await clickUndo(page)
  let state = await waitForState(page, (s) => s.objects[0]?.text === 'Equation')
  expect(state.objects[0].left).toBe(300)
  await clickRedo(page)
  await waitForState(page, (s) => s.objects[0]?.text === 'Updated')
  const deleted = await callController(page, 'deleteObject', rectangle.id)
  expect(deleted.id).toBe(rectangle.id)
  state = await getBoardState(page)
  expect(state.objects).toHaveLength(1)
  expect(state.history.tipType).toBe('delete')
  expect(state.persistence.state).toBe('dirty')
  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.length === 2)
  expect(state.objects[1].mathboardId).toBe(rectangle.id)
  await clickRedo(page)
  await waitForState(page, (s) => s.objects.length === 1)
})

test('programmable fixed Formula keeps its explicit ink through replacement and reload', async ({ page }) => {
  await gotoBoard(page)
  const [formula] = await callController(page, 'createObjects', [{
    ...specs[1], fill: '#d32f2f', mathboardInkMode: 'fixed',
  }])
  expect(formula.fill).toBe('#d32f2f')
  let state = await getBoardState(page)
  expect(new Set(state.objects[0].vectorPaints)).toEqual(new Set(['#d32f2f']))
  await callController(page, 'updateObject', formula.id, { latex: 'x=2' })
  state = await getBoardState(page)
  expect(new Set(state.objects[0].vectorPaints)).toEqual(new Set(['#d32f2f']))
  await callController(page, 'flushPersistence')
  await page.evaluate((boardId) => sessionStorage.setItem('mathboard.e2e.restoreBoardId', boardId), state.boardId)
  await page.reload()
  state = await waitForState(page, (s) => s.objects[0]?.latex === 'x=2')
  expect(state.objects[0].mathboardId).toBe(formula.id)
  expect(state.objects[0].inkMode).toBe('fixed')
  expect(new Set(state.objects[0].vectorPaints)).toEqual(new Set(['#d32f2f']))
})


test('programmable mutation during human Text editing is rejected without adding history', async ({ page }) => {
  await gotoBoard(page)
  await selectTool(page, 'Select')
  const [text] = await callController(page, 'createObjects', [{ ...specs[0], originX: 'left', originY: 'top' }])
  await clickOnCanvas(page, { x: 310, y: 170 })
  await clickOnCanvas(page, { x: 310, y: 170, clickCount: 2 })
  const textarea = page.locator('textarea').first()
  await expect(textarea).toBeAttached()
  await textarea.fill('Human edit')
  const failure = await page.evaluate(async (id) => {
    try {
      await window.__MATHBOARD_E2E__.updateObject(id, { text: 'Programmatic' })
      return null
    } catch (error) { return error.code }
  }, text.id)
  expect(failure).toBe('board_commit_failed')
  await page.keyboard.press('Escape')
  let state = await waitForState(page, (s) => s.objects[0]?.text === 'Human edit' && s.history.tipType === 'modify')
  expect(state.history.length).toBe(2)
  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects[0]?.text === 'Equation')
  expect(state.history.length).toBe(2)
  await clickRedo(page)
  await waitForState(page, (s) => s.objects[0]?.text === 'Human edit')
})
