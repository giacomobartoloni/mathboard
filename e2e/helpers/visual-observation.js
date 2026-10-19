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
import { waitForState } from './canvas.js'

/** Observe an already constructed synthetic fixture; never select or mutate it. */
export async function captureBoardView(page, testInfo, { label, expectedState }) {
  await waitForState(page, expectedState, { timeout: 15000 })
  await expect.poll(() => page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard().stable)).toBe(true)
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  for (const name of ['Select', 'Pan', 'Pen', 'Text', 'Formula', 'Shapes']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('LaTeX Formula:')).toHaveCount(0)
  await expect(page.getByRole('status', { name: 'Loading board' })).toHaveCount(0)
  await page.evaluate(async () => {
    await document.fonts.ready
    // Fabric requestRenderAll runs on animation frames after materialization.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  const path = testInfo.outputPath(`${label}.png`)
  const image = await page.screenshot({ path, fullPage: false, animations: 'disabled', caret: 'hide', scale: 'css' })
  await testInfo.attach(label, { path, contentType: 'image/png' })
  await testInfo.attach(`${label}-environment`, {
    body: JSON.stringify({ viewport: page.viewportSize(), deviceScaleFactor: await page.evaluate(() => devicePixelRatio),
      theme: 'light', browser: testInfo.project.name, synthetic: true }, null, 2),
    contentType: 'application/json',
  })
  return image
}
