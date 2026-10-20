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
import { selectShape, clickUndo, clickRedo } from './helpers/board.js'
import { canvasBox, dragOnCanvas, getBoardState, waitForState } from './helpers/canvas.js'

const SELECT = { name: 'Select', exact: true }
const SHAPES = { name: 'Shapes', exact: true }

/** Shapes is one-shot: after a commit the toolbar must show Select, not Shapes. */
async function expectSelectActive(page) {
  await expect(page.getByRole('button', SELECT)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', SHAPES)).toHaveAttribute('aria-pressed', 'false')
}

const scenarios = [
  {
    label: 'Rectangle',
    key: 'r',
    type: 'Rect',
    draw: { x1: 280, y1: 180, x2: 420, y2: 300 },
    move: { x1: 350, y1: 240, x2: 400, y2: 275 },
  },
  {
    label: 'Circle',
    key: 'c',
    type: 'Circle',
    draw: { x1: 350, y1: 225, x2: 440, y2: 290 },
    move: { x1: 350, y1: 225, x2: 400, y2: 255 },
  },
  {
    label: 'Line',
    key: 'l',
    type: 'Line',
    draw: { x1: 360, y1: 180, x2: 460, y2: 280 },
    move: { x1: 410, y1: 230, x2: 460, y2: 260 },
  },
]

for (const scenario of scenarios) {
  test(`E2E-P0 shape ${scenario.label}: one-shot and no duplicate on move`, async ({ page }) => {
    await gotoBoard(page)
    const initial = await getBoardState(page)

    await selectShape(page, scenario.label)
    await dragOnCanvas(page, scenario.draw)

    // The regression: on baseline the toolbar stays on Shapes.
    await expectSelectActive(page)

    let state = await waitForState(page, (s) => s.objects.length === 1)
    expect(state.objects[0].type).toBe(scenario.type)
    expect(state.history.length).toBe(initial.history.length + 1)
    expect(state.history.tipType).toBe('add')
    const addStep = state.history.step
    const original = { left: state.objects[0].left, top: state.objects[0].top }

    // Dragging a completed shape moves it, never creates a second one.
    await dragOnCanvas(page, scenario.move)

    state = await waitForState(page, (s) => s.history.tipType === 'modify')
    expect(state.objects).toHaveLength(1)
    expect(state.objects[0].type).toBe(scenario.type)
    expect(state.history.length).toBe(initial.history.length + 2)
    expect(
      Math.abs(state.objects[0].left - original.left)
      + Math.abs(state.objects[0].top - original.top),
    ).toBeGreaterThan(5)

    await clickUndo(page)
    state = await waitForState(page, (s) => s.history.step === addStep)
    expect(state.objects).toHaveLength(1)
    expect(Math.abs(state.objects[0].left - original.left)).toBeLessThanOrEqual(5)
    expect(Math.abs(state.objects[0].top - original.top)).toBeLessThanOrEqual(5)

    await clickUndo(page)
    await waitForState(page, (s) => s.objects.length === 0)
    await clickRedo(page)
    await waitForState(page, (s) => s.objects.length === 1)
    await clickRedo(page)
    state = await waitForState(page, (s) => s.history.tipType === 'modify' && s.objects.length === 1)
    expect(state.objects[0].type).toBe(scenario.type)
  })

  test(`E2E-P0 shape ${scenario.label}: keyboard shortcut ${scenario.key} is one-shot`, async ({ page }) => {
    await gotoBoard(page)

    await page.keyboard.press(scenario.key)
    await dragOnCanvas(page, scenario.draw)

    await expectSelectActive(page)
    const state = await waitForState(page, (s) => s.objects.length === 1)
    expect(state.objects[0].type).toBe(scenario.type)
    expect(state.history.tipType).toBe('add')
  })
}

test('E2E-P0 shape Escape during gesture cancels without a command', async ({ page }) => {
  await gotoBoard(page)
  const initial = await getBoardState(page)

  await selectShape(page, 'Rectangle')
  const box = await canvasBox(page)
  await page.mouse.move(box.x + 280, box.y + 180)
  await page.mouse.down()
  await page.mouse.move(box.x + 420, box.y + 300, { steps: 12 })

  await page.keyboard.press('Escape')
  await page.mouse.up()

  const state = await getBoardState(page)
  expect(state.objects).toHaveLength(0)
  expect(state.history.length).toBe(initial.history.length)
  // Shapes stays available until the user chooses another tool.
  await expect(page.getByRole('button', SHAPES)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', SELECT)).toHaveAttribute('aria-pressed', 'false')
})

test('E2E-P0 shape manual tool switch mid-gesture is not overridden', async ({ page }) => {
  await gotoBoard(page)

  await selectShape(page, 'Rectangle')
  const box = await canvasBox(page)
  await page.mouse.move(box.x + 280, box.y + 180)
  await page.mouse.down()
  await page.mouse.move(box.x + 420, box.y + 300, { steps: 12 })

  // Switch to Pan while the gesture is still open, then release.
  await page.keyboard.press('h')
  await page.mouse.up()

  await expect(page.getByRole('button', { name: 'Pan', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', SELECT)).toHaveAttribute('aria-pressed', 'false')

  const state = await waitForState(page, (s) => s.objects.length === 1)
  expect(state.history.tipType).toBe('add')
})

test('E2E-P0 shape second shape requires explicit reactivation', async ({ page }) => {
  await gotoBoard(page)

  await selectShape(page, 'Rectangle')
  await dragOnCanvas(page, { x1: 280, y1: 180, x2: 420, y2: 300 })
  await expectSelectActive(page)
  await waitForState(page, (s) => s.objects.length === 1)

  // Select tool is active: an empty-area drag must not author a shape.
  await dragOnCanvas(page, { x1: 520, y1: 180, x2: 640, y2: 300 })
  expect((await getBoardState(page)).objects).toHaveLength(1)

  await selectShape(page, 'Rectangle')
  await dragOnCanvas(page, { x1: 520, y1: 180, x2: 640, y2: 300 })
  await expectSelectActive(page)

  const state = await waitForState(page, (s) => s.objects.length === 2)
  expect(state.history.tipType).toBe('add')
})
