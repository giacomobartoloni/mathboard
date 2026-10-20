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
import { getBoardState } from './helpers/canvas.js'

test('E2E-P0-001 application smoke', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await gotoBoard(page)

  await expect(page.locator('.logo')).toHaveText('MathBoard')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()

  const state = await getBoardState(page)
  expect(state.objects).toEqual([])
  expect(state.history.length).toBe(0)
  expect(pageErrors).toEqual([])
})
