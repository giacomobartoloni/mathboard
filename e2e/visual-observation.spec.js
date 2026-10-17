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
import { selectTool, selectShape } from './helpers/board.js'
import { clickOnCanvas, dragOnCanvas, getBoardState, waitForState } from './helpers/canvas.js'
import { captureBoardView } from './helpers/visual-observation.js'

const latex = String.raw`A=\pi r^2=\pi\cdot 3^2=9\pi`

async function addText(page, text, x, y) {
  await selectTool(page, 'Text')
  await clickOnCanvas(page, { x, y })
  await expect(page.locator('textarea').first()).toBeAttached()
  await page.locator('textarea').first().fill(text)
  await page.keyboard.press('Escape')
  await waitForState(page, (state) => state.objects.some((object) => object.text === text))
}

async function buildExplanation(page) {
  await addText(page, 'Area of a circle', 140, 155)
  await addText(page, '1. Radius r = 3 units', 140, 250)
  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 140, y: 340 })
  await page.getByLabel('LaTeX Formula:').fill(latex)
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  const state = await waitForState(page, (state) => state.objects.some((object) => object.latex === latex), { timeout: 15000 })
  const formula = state.objects.find((object) => object.latex === latex)
  await selectTool(page, 'Select')
  await clickOnCanvas(page, { x: formula.left + formula.width / 2, y: formula.top + formula.height / 2, clickCount: 2 })
  await expect(page.getByLabel('LaTeX Formula:')).toHaveValue(latex)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await selectShape(page, 'Circle')
  await dragOnCanvas(page, { x1: 700, y1: 235, x2: 830, y2: 365 })
  await addText(page, '2. Substitute, then simplify', 140, 470)
  // Create the frame last: existing objects intercept Text/Formula insertion.
  await selectShape(page, 'Rectangle')
  await dragOnCanvas(page, { x1: 100, y1: 120, x2: 920, y2: 610 })
  await selectTool(page, 'Select')
  await clickOnCanvas(page, { x: 960, y: 650 })
  await page.mouse.move(990, 700)
}

// Compare decoded pixels within this run only: no machine-specific golden files.
async function changedPixelRatio(page, first, second) {
  return page.evaluate(async ([a, b]) => {
    const decode = async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      return context.getImageData(0, 0, canvas.width, canvas.height)
    }
    const [left, right] = await Promise.all([decode(a), decode(b)])
    if (left.width !== right.width || left.height !== right.height) return 1
    let changed = 0
    for (let index = 0; index < left.data.length; index += 4) {
      if ([0, 1, 2, 3].some((channel) => Math.abs(left.data[index + channel] - right.data[index + channel]) > 8)) changed++
    }
    return changed / (left.width * left.height)
  }, [[...first], [...second]])
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
  test.describe(`visual observation ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' })

    test('captures a synthetic explanation without changing objects or history', async ({ page }, testInfo) => {
      await gotoBoard(page, '/', { boardTheme: 'light' })
      await buildExplanation(page)
      const ready = (state) => state.objects.length === 6
        && state.objects.every((object) => [object.left, object.top, object.width, object.height].every(Number.isFinite)
          && object.width > 0 && object.height > 0)
        && state.objects.filter((object) => object.type === 'IText').length === 3
        && state.objects.some((object) => object.type === 'Rect')
        && state.objects.some((object) => object.type === 'Circle')
        && state.objects.some((object) => object.latex === latex && object.isVectorFormula
          && object.childCount > 0 && object.width > 0 && object.height > 0)
      await waitForState(page, ready)
      const before = await getBoardState(page)
      expect(before.active.selectionCount).toBe(0)
      const label = `circle-area-light-${viewport.width}x${viewport.height}`
      const first = await captureBoardView(page, testInfo, { label, expectedState: ready })
      const second = await captureBoardView(page, testInfo, { label: `${label}-repeat`, expectedState: ready })
      const after = await getBoardState(page)
      expect(after.objects).toEqual(before.objects)
      expect(after.history).toEqual(before.history)
      expect(after.viewportTransform).toEqual(before.viewportTransform)
      expect(after.zoom).toBe(before.zoom)
      expect(after.active).toEqual(before.active)
      expect(await changedPixelRatio(page, first, second)).toBeLessThanOrEqual(0.001)
    })
  })
}
