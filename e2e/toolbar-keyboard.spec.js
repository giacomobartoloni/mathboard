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

test('toolbar submenus are keyboard operable', async ({ page }) => {
  await gotoBoard(page)

  const shapes = page.getByRole('button', { name: 'Shapes', exact: true })
  await shapes.focus()
  await page.keyboard.press('Enter')
  await expect(shapes).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible()

  const stamps = page.getByRole('button', { name: 'Stamps', exact: true })
  await stamps.focus()
  await page.keyboard.press('Enter')
  await expect(stamps).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Cartesian plane', exact: true })).toBeVisible()
})
