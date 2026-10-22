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
import { selectShape, clickUndo, clickRedo } from './helpers/board.js'
import { canvasBox, clickOnCanvas, dragOnCanvas, getBoardState, waitForState } from './helpers/canvas.js'

const drawn = { x1: 360, y1: 180, x2: 460, y2: 280 }

async function createAndSelectLine(page) {
  await gotoBoard(page)
  await selectShape(page, 'Line')
  await dragOnCanvas(page, drawn)
  await waitForState(page, (state) => state.objects.length === 1)
  await expect(page.getByRole('button', { name: 'Select', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')
  await clickOnCanvas(page, { x: 410, y: 230 })
}

test('line endpoint drag changes geometry in one Undo step and keeps the same object', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await createAndSelectLine(page)
  const before = await getBoardState(page)
  const original = before.objects[0]
  expect(original.type).toBe('Line')
  expect(original.width).toBeGreaterThan(90)
  const originalId = original.mathboardId
  const originalHistoryLength = before.history.length

  // The start handle is on the line itself; the opposite endpoint stays fixed.
  await dragOnCanvas(page, { x1: 360, y1: 180, x2: 320, y2: 155 })
  let state = await waitForState(page, (s) => s.history.length === originalHistoryLength + 1)
  expect(state.history.tipType).toBe('modify')
  expect(state.objects).toHaveLength(1)
  expect(state.objects[0].mathboardId).toBe(originalId)
  expect(state.objects[0].width).toBeGreaterThan(original.width + 25)
  expect(state.objects[0].height).toBeGreaterThan(original.height + 15)

  await clickUndo(page)
  state = await waitForState(page, (s) => s.history.step === before.history.step)
  expect(state.objects[0].width).toBeCloseTo(original.width, 2)
  expect(state.objects[0].height).toBeCloseTo(original.height, 2)

  await clickRedo(page)
  state = await waitForState(page, (s) => s.history.step === before.history.step + 1)
  expect(state.objects[0].width).toBeGreaterThan(original.width + 25)
  expect(state.objects[0].mathboardId).toBe(originalId)
  expect(pageErrors).toEqual([])
})

test('Escape during endpoint drag restores geometry without a history command', async ({ page }) => {
  await createAndSelectLine(page)
  const before = await getBoardState(page)
  const box = await canvasBox(page)
  await page.mouse.move(box.x + 360, box.y + 180)
  await page.mouse.down()
  await page.mouse.move(box.x + 310, box.y + 140, { steps: 10 })
  await page.keyboard.press('Escape')
  await page.mouse.up()

  const after = await getBoardState(page)
  expect(after.history.length).toBe(before.history.length)
  expect(after.objects).toHaveLength(1)
  expect(after.objects[0].width).toBeCloseTo(before.objects[0].width, 2)
  expect(after.objects[0].height).toBeCloseTo(before.objects[0].height, 2)
})


test('Shift + endpoint drag snaps to the nearest 15 degrees and is undoable', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await createAndSelectLine(page)
  const initial = await getBoardState(page)
  await page.keyboard.down('Shift')
  try {
    await dragOnCanvas(page, { x1: 360, y1: 180, x2: 330, y2: 220 })
  } finally {
    await page.keyboard.up('Shift')
  }

  const updated = await waitForState(page, (state) => state.history.length === initial.history.length + 1)
  expect(updated.history.tipType).toBe('modify')
  const scene = await page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard())
  const edited = scene.objects[0]
  expect(edited.type).toBe('line')
  const angle = Math.atan2(edited.y1 - edited.y2, edited.x1 - edited.x2) * 180 / Math.PI
  expect(Math.abs(angle / 15 - Math.round(angle / 15))).toBeLessThan(0.01)

  await clickUndo(page)
  const undone = await waitForState(page, (state) => state.history.step === initial.history.step)
  expect(undone.objects[0].width).toBeCloseTo(initial.objects[0].width, 2)
  expect(undone.objects[0].height).toBeCloseTo(initial.objects[0].height, 2)
  await clickRedo(page)
  const redone = await waitForState(page, (state) => state.history.step === initial.history.step + 1)
  expect(redone.objects[0].mathboardId).toBe(initial.objects[0].mathboardId)
  expect(pageErrors).toEqual([])
})


test('switching to Pan during an endpoint drag cancels geometry and history immediately', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await createAndSelectLine(page)
  const before = await getBoardState(page)
  const box = await canvasBox(page)

  await page.mouse.move(box.x + drawn.x1, box.y + drawn.y1)
  await page.mouse.down()
  await page.mouse.move(box.x + 305, box.y + 128, { steps: 10 })

  // The shortcut changes tools while the physical mouse button is still held.
  await page.keyboard.press('h')
  await expect(page.getByRole('button', { name: 'Pan', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')
  const switched = await getBoardState(page)
  expect(switched.history.length).toBe(before.history.length)
  expect(switched.objects[0].left).toBeCloseTo(before.objects[0].left, 2)
  expect(switched.objects[0].top).toBeCloseTo(before.objects[0].top, 2)
  expect(switched.objects[0].width).toBeCloseTo(before.objects[0].width, 2)
  expect(switched.objects[0].height).toBeCloseTo(before.objects[0].height, 2)

  // A stale Fabric action handler must not resume the cancelled edit.
  await page.mouse.move(box.x + 280, box.y + 110, { steps: 10 })
  await page.mouse.up()
  const after = await getBoardState(page)
  expect(after.history.length).toBe(before.history.length)
  expect(after.objects[0].mathboardId).toBe(before.objects[0].mathboardId)
  for (const key of ['left', 'top', 'width', 'height']) {
    expect(after.objects[0][key]).toBeCloseTo(before.objects[0][key], 2)
  }

  // Switching back must rebuild the geometry control hit regions correctly.
  await page.keyboard.press('v')
  await expect(page.getByRole('button', { name: 'Select', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')
  await dragOnCanvas(page, { x1: drawn.x1, y1: drawn.y1, x2: 310, y2: 145 })
  const edited = await waitForState(page, (s) => s.history.length === before.history.length + 1)
  expect(edited.history.tipType).toBe('modify')
  expect(edited.objects[0].mathboardId).toBe(before.objects[0].mathboardId)
  expect(pageErrors).toEqual([])
})

test('switching tools with a selected line restores native controls for the next selection', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await createAndSelectLine(page)
  const original = await getBoardState(page)
  await page.keyboard.press('h')
  await expect(page.getByRole('button', { name: 'Pan', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('v')
  await expect(page.getByRole('button', { name: 'Select', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')
  await dragOnCanvas(page, { x1: drawn.x2, y1: drawn.y2, x2: 490, y2: 320 })
  const edited = await waitForState(page, (state) => state.history.length === original.history.length + 1)
  expect(edited.objects[0].mathboardId).toBe(original.objects[0].mathboardId)
  expect(errors).toEqual([])
})
