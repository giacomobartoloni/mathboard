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
import { gotoBoard, seedBoardStorage } from './fixtures.js'
import { clickUndo, clickRedo, selectTool, selectShape } from './helpers/board.js'
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

test('startup restore blocks pointer, keyboard and controller work until session adoption', async ({ page }) => {
  await gotoBoard(page)
  const [saved] = await callController(page, 'createObjects', [specs[2]])
  await callController(page, 'flushPersistence')
  const before = await getBoardState(page)
  await page.evaluate((boardId) => {
    sessionStorage.setItem('mathboard.e2e.restoreBoardId', boardId)
    sessionStorage.setItem('mathboard.e2e.pauseBootstrap', 'true')
  }, before.boardId)
  await page.reload()
  await page.waitForFunction(() => window.__MATHBOARD_E2E__?.isBootstrapWaiting())
  await expect(page.getByRole('status', { name: 'Loading board' })).toBeVisible()
  await page.keyboard.press('t')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await page.mouse.move(300, 180)
  await page.mouse.down()
  await page.mouse.move(450, 300, { steps: 8 })
  await page.mouse.up()
  expect((await getBoardState(page)).objects).toHaveLength(0)
  expect((await getBoardState(page)).history.length).toBe(0)
  const failure = await page.evaluate(async () => {
    try { await window.__MATHBOARD_E2E__.createObjects([{ type: 'text', text: 'too early' }]) }
    catch (error) { return error.code }
  })
  expect(failure).toBe('board_commit_failed')
  await page.evaluate(() => window.__MATHBOARD_E2E__.resumeBootstrap())
  await expect(page.getByRole('status', { name: 'Loading board' })).toHaveCount(0)
  let state = await getBoardState(page)
  expect(state.objects.map((o) => o.mathboardId)).toEqual([saved.id])
  await callController(page, 'updateObject', saved.id, { left: 550 })
  await callController(page, 'flushPersistence')
  await page.evaluate((id) => sessionStorage.setItem('mathboard.e2e.restoreBoardId', id), state.boardId)
  await page.reload()
  state = await waitForState(page, (s) => s.objects[0]?.left === 550)
  expect(state.objects[0].mathboardId).toBe(saved.id)
})

test('controller rejects a live human transform and leaves Undo and Redo coherent', async ({ page }) => {
  await gotoBoard(page)
  await selectTool(page, 'Select')
  const [rect] = await callController(page, 'createObjects', [{ ...specs[2], fill: '#444', originX: 'left', originY: 'top' }])
  await clickOnCanvas(page, { x: 520, y: 180 })
  await page.mouse.move(520, 180)
  await page.mouse.down()
  await page.mouse.move(600, 250, { steps: 10 })
  expect((await callController(page, 'observeBoard')).stable).toBe(false)
  const failure = await page.evaluate(async (id) => {
    try { await window.__MATHBOARD_E2E__.updateObject(id, { left: 900 }) }
    catch (error) { return error.code }
  }, rect.id)
  expect(failure).toBe('board_commit_failed')
  expect((await getBoardState(page)).history.length).toBe(1)
  await page.mouse.up()
  const moved = await waitForState(page, (s) => s.history.tipType === 'modify')
  expect(moved.history.length).toBe(2)
  expect((await callController(page, 'observeBoard')).stable).toBe(true)
  await clickUndo(page)
  await waitForState(page, (s) => Math.abs(s.objects[0]?.left - rect.left) < 0.01)
  await clickRedo(page)
  await waitForState(page, (s) => Math.abs(s.objects[0]?.left - moved.objects[0].left) < 0.01)
})

test('unchanged human Text edit returns to a stable controller boundary', async ({ page }) => {
  await gotoBoard(page)
  await selectTool(page, 'Select')
  const [text] = await callController(page, 'createObjects', [{ ...specs[0], originX: 'left', originY: 'top' }])
  await clickOnCanvas(page, { x: 310, y: 170 })
  await clickOnCanvas(page, { x: 310, y: 170, clickCount: 2 })
  await expect(page.locator('textarea').first()).toBeAttached()
  await page.keyboard.press('Escape')
  expect((await callController(page, 'observeBoard')).stable).toBe(true)
  const updated = await callController(page, 'updateObject', text.id, { text: 'After editing' })
  expect(updated.text).toBe('After editing')
  expect((await getBoardState(page)).history.length).toBe(2)
})

test('a live Pencil stroke blocks controller commits until its add command', async ({ page }) => {
  await gotoBoard(page)
  await selectTool(page, 'Pen')
  await page.mouse.move(300, 180)
  await page.mouse.down()
  await page.mouse.move(450, 260, { steps: 8 })
  expect((await callController(page, 'observeBoard')).stable).toBe(false)
  const failure = await page.evaluate(async () => {
    try { await window.__MATHBOARD_E2E__.createObjects([{ type: 'text', text: 'Interleaved' }]) }
    catch (error) { return error.code }
  })
  expect(failure).toBe('board_commit_failed')
  expect((await getBoardState(page)).history.length).toBe(0)
  await page.mouse.up()
  await waitForState(page, (s) => s.history.length === 1 && s.objects[0]?.type === 'Path')
  expect((await callController(page, 'observeBoard')).stable).toBe(true)
})

test('unfinished shape observation stays transient without assigning IDs', async ({ page }) => {
  await gotoBoard(page)
  await selectShape(page, 'Rectangle')
  await page.mouse.move(300, 180)
  await page.mouse.down()
  await page.mouse.move(450, 260, { steps: 8 })
  const observation = await callController(page, 'observeBoard')
  expect(observation.stable).toBe(false)
  expect(observation.objects).toHaveLength(1)
  expect((await getBoardState(page)).objects[0].mathboardId).toBeNull()
  const failure = await page.evaluate(async () => {
    try { await window.__MATHBOARD_E2E__.createObjects([{ type: 'text', text: 'Interleaved' }]) }
    catch (error) { return error.code }
  })
  expect(failure).toBe('board_commit_failed')
  await page.mouse.up()
  const committed = await waitForState(page, (s) => s.history.length === 1)
  expect(committed.objects[0].mathboardId).toMatch(/^mbobj_/)
  expect((await callController(page, 'observeBoard')).stable).toBe(true)
})

test('failed startup storage explicitly opens an editable unsaved runtime session', async ({ page }) => {
  await seedBoardStorage(page)
  await page.addInitScript(() => {
    indexedDB.open = () => { throw new Error('Storage disabled for regression') }
  })
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__MATHBOARD_E2E__))
  await expect(page.getByRole('status', { name: 'Loading board' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('Your changes may not be saved')
  const [text] = await callController(page, 'createObjects', [{ type: 'text', text: 'Runtime only' }])
  expect(text.text).toBe('Runtime only')
  expect((await getBoardState(page)).history.length).toBe(1)
  expect((await callController(page, 'observeBoard')).boardId).toBeNull()
})
