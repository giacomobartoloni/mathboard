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
import { getBoardState } from './helpers/canvas.js'

test('recolor notification failure restores paint and coalesced history before Undo', async ({ page }) => {
  await gotoBoard(page)
  await page.evaluate(() => window.__MATHBOARD_E2E__.createObjects(
    [{ type: 'rect', left: 280, top: 180, width: 80, height: 65 }],
    { select: true },
  ))
  await page.evaluate(() => window.__MATHBOARD_E2E__.recolorSelected('#234567', { coalesce: true }))
  const committed = await getBoardState(page)
  const beforePaint = committed.objects[0].stroke
  expect(beforePaint).toBe('#234567')
  expect(committed.history.tipType).toBe('recolor')

  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.failNextDocumentChange())).toBe(true)
  await expect(page.evaluate(() => window.__MATHBOARD_E2E__.recolorSelected('#abcdef', { coalesce: true })))
    .rejects.toThrow(/Injected document-change failure/)
  const afterFailure = await getBoardState(page)
  expect(afterFailure.history).toEqual(committed.history)
  expect(afterFailure.objects[0].stroke).toBe(beforePaint)
  expect(afterFailure.objects[0].inkMode).toBe(committed.objects[0].inkMode)
  expect(afterFailure.objects[0].mathboardId).toBe(committed.objects[0].mathboardId)

  await page.keyboard.press('ControlOrMeta+Z')
  const afterUndo = await getBoardState(page)
  expect(afterUndo.history.step).toBe(committed.history.step - 1)
  await page.keyboard.press('ControlOrMeta+Shift+Z')
  const afterRedo = await getBoardState(page)
  expect(afterRedo.objects[0].stroke).toBe(beforePaint)
  expect(afterRedo.history).toEqual(committed.history)
})
