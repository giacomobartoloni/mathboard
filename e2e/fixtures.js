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

export async function seedBoardStorage(page, { boardTheme = 'light' } = {}) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())
  await page.route(/simpleanalyticscdn\.com/, (route) => route.abort())
  await page.addInitScript((theme) => {
    localStorage.setItem('mathboard_cookie_consent', JSON.stringify({
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    }))
    localStorage.setItem('mathboard_ui_theme', theme === 'light' ? 'light' : 'dark')
    localStorage.setItem('mathboard_board_theme', theme)
    // Isolate persistence across tests. A reload can opt into restore via sessionStorage.
    const restoreId = sessionStorage.getItem('mathboard.e2e.restoreBoardId')
    if (restoreId) {
      localStorage.setItem('mathboard.lastBoardId', restoreId)
      sessionStorage.removeItem('mathboard.e2e.restoreBoardId')
    } else {
      localStorage.removeItem('mathboard.lastBoardId')
    }
  }, boardTheme)
}

export async function gotoBoard(page, path = '/', options = {}) {
  await seedBoardStorage(page, options)
  await page.goto(path)
  await page.waitForFunction(() => {
    const state = window.__MATHBOARD_E2E__?.getState?.()
    return Boolean(state)
      && Boolean(document.querySelector('canvas.upper-canvas'))
      && Boolean(state.boardId)
  })
  await expect(page.getByRole('status', { name: 'Loading board' })).toHaveCount(0)
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  return getBoardState(page)
}
