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
import { insertStamp, clickUndo, clickRedo, selectTool } from './helpers/board.js'
import { clickOnCanvas, getBoardState, waitForState } from './helpers/canvas.js'

/** cartesianPlane kit: 2 axes + 4 arrow segments + 3 labels */
const CARTESIAN_PLANE_CHILDREN = 9

function assertCartesianPlane(state) {
  expect(state.objects).toHaveLength(1)
  const stamp = state.objects.find((o) => o.type === 'Group')
  expect(stamp).toBeTruthy()
  expect(stamp.childCount).toBe(CARTESIAN_PLANE_CHILDREN)
}

test('E2E-P0-007 stamp insert undo share bootstrap', async ({ page, context }) => {
  await gotoBoard(page)
  const before = await getBoardState(page)
  await insertStamp(page, 'Cartesian plane')

  let state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.type === 'Group' && o.childCount === CARTESIAN_PLANE_CHILDREN),
    { timeout: 15000 },
  )
  expect(state.history.length).toBe(before.history.length + 1)
  expect(state.history.tipType).toBe('add')
  assertCartesianPlane(state)

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.length === 0)

  await clickRedo(page)
  state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.type === 'Group' && o.childCount === CARTESIAN_PLANE_CHILDREN),
  )
  assertCartesianPlane(state)

  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+Shift+L')
  const urlInput = page.getByRole('dialog', { name: 'Share board link' }).getByLabel(
    'Anyone with this link opens a board with the current selection:',
  )
  await expect(urlInput).toBeVisible()
  const shareUrl = await urlInput.inputValue()
  expect(shareUrl).toContain('#s=')

  const boot = await context.newPage()
  const errors = []
  boot.on('pageerror', (err) => errors.push(err.message))
  await gotoBoard(boot, shareUrl)

  state = await waitForState(
    boot,
    (s) => s.objects.some((o) => o.type === 'Group' && o.childCount === CARTESIAN_PLANE_CHILDREN),
    { timeout: 15000 },
  )
  assertCartesianPlane(state)
  await expect(boot.locator('.stamp-error')).toHaveCount(0)
  await expect(boot).not.toHaveURL(/#s=/)
  expect(errors).toEqual([])
  await boot.close()
})

test('E2E-P0-007b formula stamp follows destination board auto ink across themes', async ({ page, browser }) => {
  await gotoBoard(page)
  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 340, y: 240 })

  const latexInput = page.getByLabel('LaTeX Formula:')
  await expect(latexInput).toBeVisible()
  await latexInput.fill('a+b')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()

  let state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.formulaType === 'katex-formula' && o.latex === 'a+b'),
    { timeout: 15000 },
  )
  const sourceFormula = state.objects.find((o) => o.formulaType === 'katex-formula')
  expect(sourceFormula.isVectorFormula).toBe(true)
  expect(sourceFormula.filterTypes).toEqual([])
  expect(sourceFormula.vectorPaints.every((paint) => paint === '#000000' || paint === 'black')).toBe(true)

  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+Shift+L')
  const urlInput = page.getByRole('dialog', { name: 'Share board link' }).getByLabel(
    'Anyone with this link opens a board with the current selection:',
  )
  await expect(urlInput).toBeVisible()
  const shareUrl = await urlInput.inputValue()
  expect(shareUrl).toContain('#s=')

  // Isolate destination localStorage so chalkboard is not overwritten by the
  // Light board that authored the Stamp (same Playwright context shares storage).
  const bootContext = await browser.newContext()
  const boot = await bootContext.newPage()
  const errors = []
  boot.on('pageerror', (err) => errors.push(err.message))
  await gotoBoard(boot, shareUrl, { boardTheme: 'chalkboard' })

  state = await waitForState(
    boot,
    (s) => s.objects.some((o) => (
      (o.formulaType === 'katex-formula' && o.latex === 'a+b')
      || (o.children || []).some((c) => c.formulaType === 'katex-formula' && c.latex === 'a+b')
    )),
    { timeout: 15000 },
  )
  const imported = state.objects.find((o) => o.formulaType === 'katex-formula')
    || state.objects.flatMap((o) => o.children || []).find((o) => o.formulaType === 'katex-formula')
  expect(imported).toBeTruthy()
  expect(imported.inkMode).toBe('auto')
  expect(imported.isVectorFormula).toBe(true)
  expect(imported.filterTypes).toEqual([])
  // Chalkboard default ink; vector recolor, no Invert / polarity metadata.
  expect(imported.vectorPaints.length).toBeGreaterThan(0)
  expect(imported.vectorPaints.every((paint) => paint === '#f4f1de')).toBe(true)
  await expect(boot.locator('.stamp-error')).toHaveCount(0)
  expect(errors).toEqual([])
  await bootContext.close()
})
