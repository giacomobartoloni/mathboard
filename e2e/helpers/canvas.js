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

export async function getBoardState(page) {
  return page.evaluate(() => window.__MATHBOARD_E2E__.getState())
}

export async function waitForState(page, predicate, options = {}) {
  await expect.poll(async () => {
    const state = await getBoardState(page)
    return predicate(state) ? state : null
  }, { timeout: 10000, ...options }).not.toBeNull()
  return getBoardState(page)
}

export async function canvasBox(page) {
  const box = await page.locator('canvas.upper-canvas').boundingBox()
  if (!box) throw new Error('upper-canvas not found')
  return box
}

/** Drag in board-local coords relative to upper-canvas top-left. */
export async function dragOnCanvas(page, { x1, y1, x2, y2 }) {
  const box = await canvasBox(page)
  const start = { x: box.x + x1, y: box.y + y1 }
  const end = { x: box.x + x2, y: box.y + y2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.mouse.up()
}

export async function clickOnCanvas(page, { x, y, clickCount = 1 }) {
  const box = await canvasBox(page)
  await page.mouse.click(box.x + x, box.y + y, { clickCount })
}

/** Safe drawing area away from left chrome / selection panel. */
export function safeDrag() {
  return { x1: 280, y1: 180, x2: 420, y2: 300 }
}
