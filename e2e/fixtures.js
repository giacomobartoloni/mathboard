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

import { expect } from '@playwright/test'
import { getBoardState } from './helpers/canvas.js'

export async function seedBoardStorage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('mathboard_cookie_consent', JSON.stringify({
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    }))
    localStorage.setItem('mathboard_ui_theme', 'light')
    localStorage.setItem('mathboard_board_theme', 'light')
  })
}

export async function gotoBoard(page, path = '/') {
  await seedBoardStorage(page)
  await page.goto(path)
  await page.waitForFunction(() => {
    return Boolean(window.__MATHBOARD_E2E__?.getState)
      && Boolean(document.querySelector('canvas.upper-canvas'))
  })
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  return getBoardState(page)
}
