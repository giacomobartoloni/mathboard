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
import { selectShape, clickUndo, clickRedo } from './helpers/board.js'
import { dragOnCanvas, waitForState } from './helpers/canvas.js'

async function drawRect(page, drag) {
  await selectShape(page, 'shape-rectangle')
  await dragOnCanvas(page, drag)
  await waitForState(page, (s) => s.objects.some((o) => o.type === 'Rect'))
}

async function drawCircle(page, drag) {
  await selectShape(page, 'shape-circle')
  await dragOnCanvas(page, drag)
  await waitForState(page, (s) => s.objects.filter((o) => o.type === 'Rect' || o.type === 'Circle').length >= 2)
}

test('E2E-P0-006 group ungroup reversible', async ({ page }) => {
  await gotoBoard(page)
  await drawRect(page, { x1: 280, y1: 160, x2: 360, y2: 230 })
  await drawCircle(page, { x1: 400, y1: 180, x2: 470, y2: 250 })

  let state = await waitForState(page, (s) => s.objects.length === 2)
  const before = state.objects.map((o) => ({ type: o.type, left: o.left, top: o.top }))
  const beforeRel = {
    dx: before.find((o) => o.type === 'Circle').left - before.find((o) => o.type === 'Rect').left,
    dy: before.find((o) => o.type === 'Circle').top - before.find((o) => o.type === 'Rect').top,
  }

  function assertLayout(objects) {
    expect(objects).toHaveLength(2)
    expect(objects.some((o) => o.type === 'Group')).toBe(false)
    for (const obj of before) {
      const match = objects.find((o) => o.type === obj.type)
      expect(match).toBeTruthy()
      expect(Math.abs(match.left - obj.left)).toBeLessThan(40)
      expect(Math.abs(match.top - obj.top)).toBeLessThan(40)
    }
    const rel = {
      dx: objects.find((o) => o.type === 'Circle').left - objects.find((o) => o.type === 'Rect').left,
      dy: objects.find((o) => o.type === 'Circle').top - objects.find((o) => o.type === 'Rect').top,
    }
    expect(Math.abs(rel.dx - beforeRel.dx)).toBeLessThan(40)
    expect(Math.abs(rel.dy - beforeRel.dy)).toBeLessThan(40)
  }

  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+G')

  state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Group' && o.childCount === 2))
  expect(state.objects).toHaveLength(1)
  expect(state.history.tipType).toBe('group')

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.length === 2 && !s.objects.some((o) => o.type === 'Group'))
  assertLayout(state.objects)

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Group' && o.childCount === 2))

  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+Shift+G')
  state = await waitForState(page, (s) => s.history.tipType === 'ungroup' && s.objects.length === 2)
  assertLayout(state.objects)

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Group' && o.childCount === 2))

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.length === 2 && !s.objects.some((o) => o.type === 'Group'))
  assertLayout(state.objects)
})
