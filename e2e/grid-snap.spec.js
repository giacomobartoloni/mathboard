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
import { canvasBox, getBoardState } from './helpers/canvas.js'

async function dragBy(page, start, change) {
  const canvas = await canvasBox(page)
  const x = canvas.x + start.x
  const y = canvas.y + start.y
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + change.x, y + change.y, { steps: 12 })
  await page.mouse.up()
}

test('F042 magnetic object drag is invisible, undoable and locally configurable', async ({ page }) => {
  await gotoBoard(page)
  const toggle = page.getByRole('button', { name: 'Snap to Grid', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.__MATHBOARD_E2E__.createObjects([
    { type: 'rect', left: 281, top: 181, width: 80, height: 60, strokeWidth: 0 },
  ], { select: true }))
  const before = await getBoardState(page)
  expect(before.objects).toHaveLength(1)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const afterToggle = await getBoardState(page)
  expect(afterToggle.history).toEqual(before.history)
  await dragBy(page, { x: 321, y: 220 }, { x: 18.4, y: 18.4 })
  const snapped = await getBoardState(page)
  expect(snapped.history.length).toBe(before.history.length + 1)
  expect(snapped.history.tipType).toBe('modify')
  expect(snapped.objects).toHaveLength(1)
  expect(snapped.objects[0].left).toBeCloseTo(300, 0)
  expect(snapped.objects[0].top).toBeCloseTo(200, 0)

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const undone = await getBoardState(page)
  expect(undone.objects[0].left).toBeCloseTo(before.objects[0].left, 3)
  expect(undone.objects[0].top).toBeCloseTo(before.objects[0].top, 3)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  const redone = await getBoardState(page)
  expect(redone.objects[0].left).toBeCloseTo(snapped.objects[0].left, 3)
  expect(redone.objects[0].top).toBeCloseTo(snapped.objects[0].top, 3)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Snap to Grid' })).toHaveAttribute('aria-pressed', 'true')
  const persisted = await getBoardState(page)
  expect(persisted.objects[0].left).toBeCloseTo(snapped.objects[0].left, 3)
  expect(persisted.objects[0].top).toBeCloseTo(snapped.objects[0].top, 3)
})

test('F042 does not snap free placement when disabled', async ({ page }) => {
  await gotoBoard(page)
  const toggle = page.getByRole('button', { name: 'Snap to Grid', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.__MATHBOARD_E2E__.createObjects([
    { type: 'rect', left: 281, top: 181, width: 80, height: 60, strokeWidth: 0 },
  ], { select: true }))
  await dragBy(page, { x: 321, y: 220 }, { x: 18.4, y: 18.4 })
  const state = await getBoardState(page)
  expect(state.objects[0].left).toBeCloseTo(299.4, 0)
  expect(state.objects[0].top).toBeCloseTo(199.4, 0)
  expect(state.history.tipType).toBe('modify')
})
