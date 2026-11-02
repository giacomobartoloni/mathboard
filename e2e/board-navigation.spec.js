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
import { canvasBox } from './helpers/canvas.js'

test('Space temporarily pans and restores the previously selected tool', async ({ page }) => {
  await gotoBoard(page)
  await page.keyboard.press('p')
  const pen = page.getByRole('button', { name: 'Pen', exact: true })
  const pan = page.getByRole('button', { name: 'Pan', exact: true })
  await expect(pen).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.down('Space')
  await expect(pan).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.up('Space')
  await expect(pen).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.down('Space')
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.keyboard.up('Space')
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('wheel zooms at the cursor and updates the zoom indicator', async ({ page }) => {
  await gotoBoard(page)
  const canvas = await canvasBox(page)
  await page.mouse.move(canvas.x + 380, canvas.y + 220)
  const zoom = page.getByRole('button', { name: /Reset zoom to 100%/ })
  await expect(zoom).toHaveText('100%')
  await page.mouse.wheel(0, -250)
  await expect.poll(async () => {
    const label = await page.locator('.zoom-button.reset').textContent()
    return Number.parseInt(label, 10)
  }).toBeGreaterThan(100)
  await page.mouse.wheel(0, 250)
  await expect(page.locator('.zoom-button.reset')).toHaveText('100%')
})
