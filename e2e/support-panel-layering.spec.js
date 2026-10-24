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

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`About covers the board switcher at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await gotoBoard(page)
    const switcher = page.getByRole('button', { name: /^Boards:/ })
    await expect(switcher).toBeVisible()
    await page.getByRole('button', { name: 'About' }).click()
    const overlay = page.locator('.support-panel .modal-overlay')
    await expect(overlay).toBeVisible()

    const switcherBox = await switcher.boundingBox()
    const hitIsAbout = await page.evaluate(({ x, y }) =>
      Boolean(document.elementFromPoint(x, y)?.closest('.modal-overlay')),
    { x: switcherBox.x + switcherBox.width / 2, y: switcherBox.y + switcherBox.height / 2 })
    expect(hitIsAbout).toBe(true)
  })
}
