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
import { selectTool } from './helpers/board.js'
import { dragOnCanvas, getBoardState, safeDrag, waitForState } from './helpers/canvas.js'

async function flushPersistence(page) {
  await page.evaluate(async () => {
    await window.__MATHBOARD_E2E__.flushPersistence()
  })
}

test('E2E persistence: save reload preserves path identity and clears history', async ({ page }) => {
  await gotoBoard(page)
  await selectTool(page, 'Pen')
  await dragOnCanvas(page, safeDrag())

  let state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Path'))
  expect(state.history.length).toBeGreaterThan(0)
  const pathId = state.objects.find((o) => o.type === 'Path').mathboardId
  expect(pathId).toMatch(/^mbobj_/)
  const boardId = state.boardId
  expect(boardId).toMatch(/^mb_/)

  await flushPersistence(page)
  state = await waitForState(page, (s) => s.persistence?.state === 'clean' || s.persistence?.state === 'saved')

  // Init script clears lastBoardId on navigation unless this session flag is set.
  await page.evaluate((id) => {
    sessionStorage.setItem('mathboard.e2e.restoreBoardId', id)
  }, boardId)

  await page.reload()
  await page.waitForFunction(() => window.__MATHBOARD_E2E__?.getState?.()?.boardId)

  state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Path'))
  expect(state.boardId).toBe(boardId)
  expect(state.objects.find((o) => o.type === 'Path').mathboardId).toBe(pathId)
  expect(state.history.length).toBe(0)
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
