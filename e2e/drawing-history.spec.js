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
import { selectTool, selectShape, clickUndo, clickRedo } from './helpers/board.js'
import { dragOnCanvas, getBoardState, safeDrag, waitForState } from './helpers/canvas.js'

test('E2E-P0-002 pencil draw undo redo', async ({ page }) => {
  await gotoBoard(page)
  const before = await getBoardState(page)

  await selectTool(page, 'tool-pencil')
  await dragOnCanvas(page, safeDrag())

  let state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Path'))
  expect(state.objects.filter((o) => o.type === 'Path')).toHaveLength(1)
  expect(state.history.length).toBe(before.history.length + 1)
  expect(state.history.tipType).toBe('add')
  const afterDraw = state.history.length

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.length === 0)
  expect(state.history.step).toBe(afterDraw - 2)

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Path'))
  expect(state.objects.filter((o) => o.type === 'Path')).toHaveLength(1)
})

test('E2E-P0-003 shape geometry survives history', async ({ page }) => {
  await gotoBoard(page)
  const before = await getBoardState(page)
  await selectShape(page, 'shape-rectangle')
  await dragOnCanvas(page, safeDrag())

  let state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Rect'))
  expect(state.objects.filter((o) => o.type === 'Rect')).toHaveLength(1)
  expect(state.history.length).toBe(before.history.length + 1)
  expect(state.history.tipType).toBe('add')

  const rect = state.objects.find((o) => o.type === 'Rect')
  expect(Math.abs(rect.width)).toBeGreaterThan(10)
  expect(Math.abs(rect.height)).toBeGreaterThan(10)
  const geometry = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }

  await clickUndo(page)
  state = await waitForState(page, (s) => !s.objects.some((o) => o.type === 'Rect'))

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Rect'))
  const restored = state.objects.find((o) => o.type === 'Rect')
  expect(Math.abs(restored.left - geometry.left)).toBeLessThanOrEqual(2)
  expect(Math.abs(restored.top - geometry.top)).toBeLessThanOrEqual(2)
  expect(Math.abs(restored.width - geometry.width)).toBeLessThanOrEqual(2)
  expect(Math.abs(restored.height - geometry.height)).toBeLessThanOrEqual(2)
  expect(restored.width).not.toBe(0)
  expect(restored.height).not.toBe(0)
})
