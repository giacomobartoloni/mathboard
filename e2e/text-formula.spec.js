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
import { selectTool, clickUndo, clickRedo } from './helpers/board.js'
import { clickOnCanvas, waitForState } from './helpers/canvas.js'

async function createText(page, value) {
  await selectTool(page, 'tool-text')
  await clickOnCanvas(page, { x: 320, y: 220 })
  const textarea = page.locator('textarea').first()
  await expect(textarea).toBeAttached()
  await textarea.fill(value)
  await page.keyboard.press('Escape')
  return waitForState(page, (s) => s.objects.some((o) => o.type === 'IText' && o.text === value))
}

test('E2E-P0-004 text create and edit survive history', async ({ page }) => {
  await gotoBoard(page)

  let state = await createText(page, 'equazione')
  expect(state.history.tipType).toBe('add')
  expect(state.objects.filter((o) => o.type === 'IText')).toHaveLength(1)

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.length === 0)

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.text === 'equazione'))
  expect(state.objects[0].text).toBe('equazione')
  expect(state.objects[0].text).not.toBe('Text')

  await selectTool(page, 'tool-select')
  await clickOnCanvas(page, { x: 320, y: 220 })
  await clickOnCanvas(page, { x: 320, y: 220, clickCount: 2 })
  const textarea = page.locator('textarea').first()
  await expect(textarea).toBeAttached()
  await textarea.fill('equazione 2')
  await page.keyboard.press('Escape')

  state = await waitForState(page, (s) => s.history.tipType === 'modify' && s.objects.some((o) => o.text === 'equazione 2'))
  expect(state.history.tipType).toBe('modify')

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.text === 'equazione'))
  expect(state.objects[0].text).toBe('equazione')

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.text === 'equazione 2'))
  expect(state.objects[0].text).toBe('equazione 2')
})

test('E2E-P0-005 formula lifecycle is atomic and editable', async ({ page }) => {
  await gotoBoard(page)
  await selectTool(page, 'tool-formula')
  await clickOnCanvas(page, { x: 340, y: 240 })

  await expect(page.locator('#latex-input')).toBeVisible()
  await page.locator('#latex-input').fill('x^2')
  await page.locator('.btn-insert').click()

  let state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.formulaType === 'katex-formula' && o.latex === 'x^2'),
    { timeout: 15000 },
  )
  expect(state.history.tipType).toBe('add')
  expect(state.objects.filter((o) => o.formulaType === 'katex-formula')).toHaveLength(1)

  const formula = state.objects.find((o) => o.formulaType === 'katex-formula')
  await page.getByRole('button', { name: 'Edit formula' }).click()
  await expect(page.locator('#latex-input')).toHaveValue('x^2')
  await page.locator('#latex-input').fill('x^3')
  await page.locator('.btn-insert').click()

  state = await waitForState(
    page,
    (s) => s.history.tipType === 'replace' && s.objects.some((o) => o.latex === 'x^3'),
    { timeout: 15000 },
  )

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.latex === 'x^2'))
  expect(state.objects.some((o) => o.latex === 'x^3')).toBe(false)

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.latex === 'x^3'))

  await page.keyboard.press('ControlOrMeta+A')
  await page.getByRole('button', { name: 'Edit formula' }).click()
  await expect(page.locator('#latex-input')).toHaveValue('x^3')
})
