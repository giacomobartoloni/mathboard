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
import { selectShape } from './helpers/board.js'
import { clickOnCanvas, dragOnCanvas, getBoardState } from './helpers/canvas.js'

test('marquee selects fully enclosed objects, not partially overlapping objects', async ({ page }) => {
  await gotoBoard(page)
  await selectShape(page, 'Rectangle')
  await dragOnCanvas(page, { x1: 280, y1: 180, x2: 360, y2: 260 })
  await selectShape(page, 'Rectangle')
  await dragOnCanvas(page, { x1: 440, y1: 180, x2: 520, y2: 260 })

  const before = await getBoardState(page)
  expect(before.objects).toHaveLength(2)
  await dragOnCanvas(page, { x1: 260, y1: 155, x2: 475, y2: 285 })

  let state = await getBoardState(page)
  expect(state.active.selectionCount).toBe(1)
  expect(state.active.type).toBe('Rect')
  expect(state.history).toEqual(before.history)

  await dragOnCanvas(page, { x1: 260, y1: 155, x2: 540, y2: 285 })
  state = await getBoardState(page)
  expect(state.active.selectionCount).toBe(2)
  expect(state.history).toEqual(before.history)
})

test('click selects the painted line rather than empty space inside its bounds', async ({ page }) => {
  await gotoBoard(page)
  await selectShape(page, 'Line')
  await dragOnCanvas(page, { x1: 300, y1: 180, x2: 460, y2: 300 })

  const before = await getBoardState(page)
  expect(before.objects).toHaveLength(1)

  await clickOnCanvas(page, { x: 430, y: 193 })
  expect((await getBoardState(page)).active.selectionCount).toBe(0)

  await clickOnCanvas(page, { x: 380, y: 240 })
  expect((await getBoardState(page)).active.selectionCount).toBe(1)

  await clickOnCanvas(page, { x: 430, y: 193 })
  const after = await getBoardState(page)
  expect(after.active.selectionCount).toBe(0)
  expect(after.history).toEqual(before.history)
})

test('transparent rectangle selects from its outline, not its unpainted interior', async ({ page }) => {
  await gotoBoard(page)
  await selectShape(page, 'Rectangle')
  await dragOnCanvas(page, { x1: 280, y1: 180, x2: 420, y2: 300 })

  const before = await getBoardState(page)
  await clickOnCanvas(page, { x: 350, y: 240 })
  expect((await getBoardState(page)).active.selectionCount).toBe(0)

  await clickOnCanvas(page, { x: 350, y: 180 })
  const after = await getBoardState(page)
  expect(after.active.selectionCount).toBe(1)
  expect(after.history).toEqual(before.history)
})
