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
import { clickRedo, clickUndo } from './helpers/board.js'
import { getBoardState, waitForState } from './helpers/canvas.js'

const TEMPLATES = [
  'Cartesian grid (10×10)',
  'Square grid (5 mm)',
  'Ruled paper',
  'Triangular grid',
  'Complex plane',
]

test('FEAT-4 educational grids insert, undo/redo and reopen from IndexedDB', async ({ page }) => {
  await gotoBoard(page)

  for (const [index, label] of TEMPLATES.entries()) {
    await page.getByRole('button', { name: 'Stamps', exact: true }).click()
    await page.getByRole('button', { name: label, exact: true }).click()
    const state = await waitForState(
      page,
      (current) => current.objects.length === index + 1
        && current.objects.every((object) => object.type === 'Group'),
    )
    expect(state.objects[index].childCount).toBeGreaterThan(10)
  }

  const before = await getBoardState(page)
  const ids = before.objects.map((object) => object.mathboardId)
  expect(new Set(ids).size).toBe(TEMPLATES.length)
  await clickUndo(page)
  await waitForState(page, (state) => state.objects.length === TEMPLATES.length - 1)
  await clickRedo(page)
  await waitForState(page, (state) => state.objects.length === TEMPLATES.length)

  await page.evaluate(async () => {
    await window.__MATHBOARD_E2E__.flushPersistence()
  })
  await page.reload()

  const reopened = await waitForState(
    page,
    (state) => state.boardId === before.boardId
      && state.objects.length === TEMPLATES.length
      && state.persistence?.state === 'clean',
    { timeout: 15000 },
  )
  expect(reopened.objects.map((object) => object.mathboardId)).toEqual(ids)
  expect(reopened.objects.every((object) => object.type === 'Group')).toBe(true)
  expect(reopened.objects.every((object) => object.childCount > 10)).toBe(true)
})
