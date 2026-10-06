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
import { insertStamp, clickUndo, clickRedo } from './helpers/board.js'
import { waitForState } from './helpers/canvas.js'

test('E2E-P0-007 stamp insert undo share bootstrap', async ({ page, context }) => {
  await gotoBoard(page)
  await insertStamp(page, 'stamp-cartesian-plane')

  let state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.type === 'Group'),
    { timeout: 15000 },
  )
  expect(state.history.tipType).toBe('add')

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.length === 0)

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.type === 'Group'))

  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+Shift+L')
  const urlInput = page.locator('#share-stamp-url')
  await expect(urlInput).toBeVisible()
  const shareUrl = await urlInput.inputValue()
  expect(shareUrl).toContain('#s=')

  const boot = await context.newPage()
  const errors = []
  boot.on('pageerror', (err) => errors.push(err.message))
  await gotoBoard(boot, shareUrl)

  state = await waitForState(
    boot,
    (s) => s.objects.some((o) => o.type === 'Group'),
    { timeout: 15000 },
  )
  await expect(boot.locator('.stamp-error')).toHaveCount(0)
  await expect(boot).not.toHaveURL(/#s=/)
  expect(errors).toEqual([])
  await boot.close()
})
