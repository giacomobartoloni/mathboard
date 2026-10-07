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
import { clickOnCanvas, getBoardState, waitForState } from './helpers/canvas.js'

async function createText(page, value) {
  await selectTool(page, 'Text')
  await clickOnCanvas(page, { x: 320, y: 220 })
  const textarea = page.locator('textarea').first()
  await expect(textarea).toBeAttached()
  await textarea.fill(value)
  await page.keyboard.press('Escape')
  return waitForState(page, (s) => s.objects.some((o) => o.type === 'IText' && o.text === value))
}

async function dblclickFormula(page, formula) {
  await clickOnCanvas(page, {
    x: Math.round(formula.left + (formula.width || 40) / 2),
    y: Math.round(formula.top + (formula.height || 40) / 2),
    clickCount: 2,
  })
}

async function insertFormula(page, { latex, x = 340, y = 240 } = {}) {
  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x, y })
  const latexInput = page.getByLabel('LaTeX Formula:')
  await expect(latexInput).toBeVisible()
  await latexInput.fill(latex)
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  return waitForState(
    page,
    (s) => s.objects.some((o) => o.formulaType === 'katex-formula' && o.latex === latex),
    { timeout: 15000 },
  )
}

const MATHJAX_CDN_HOST =
  /(?:^|\.)cdn\.jsdelivr\.net$|(?:^|\.)unpkg\.com$|(?:^|\.)mathjax\.org$/

test('E2E-P0-004 text create and edit survive history', async ({ page }) => {
  await gotoBoard(page)
  const beforeCreate = await getBoardState(page)

  let state = await createText(page, 'equazione')
  expect(state.history.tipType).toBe('add')
  expect(state.history.length).toBe(beforeCreate.history.length + 1)
  expect(state.objects.filter((o) => o.type === 'IText')).toHaveLength(1)

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.length === 0)

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.text === 'equazione'))
  expect(state.objects[0].text).toBe('equazione')
  expect(state.objects[0].text).not.toBe('Text')

  const beforeEdit = state.history.length
  await selectTool(page, 'Select')
  await clickOnCanvas(page, { x: 320, y: 220 })
  await clickOnCanvas(page, { x: 320, y: 220, clickCount: 2 })
  const textarea = page.locator('textarea').first()
  await expect(textarea).toBeAttached()
  await textarea.fill('equazione 2')
  await page.keyboard.press('Escape')

  state = await waitForState(page, (s) => s.history.tipType === 'modify' && s.objects.some((o) => o.text === 'equazione 2'))
  expect(state.history.tipType).toBe('modify')
  expect(state.history.length).toBe(beforeEdit + 1)

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.text === 'equazione'))
  expect(state.objects[0].text).toBe('equazione')

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.text === 'equazione 2'))
  expect(state.objects[0].text).toBe('equazione 2')
})

test('E2E-P0-005 formula lifecycle is atomic and editable', async ({ page }) => {
  await gotoBoard(page)
  const beforeCreate = await getBoardState(page)
  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 340, y: 240 })

  const latexInput = page.getByLabel('LaTeX Formula:')
  await expect(latexInput).toBeVisible()
  await latexInput.fill('x^2')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()

  let state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.formulaType === 'katex-formula' && o.latex === 'x^2'),
    { timeout: 15000 },
  )
  expect(state.history.tipType).toBe('add')
  expect(state.history.length).toBe(beforeCreate.history.length + 1)
  expect(state.objects.filter((o) => o.formulaType === 'katex-formula')).toHaveLength(1)

  const formula = state.objects.find((o) => o.formulaType === 'katex-formula')
  expect(formula.isVectorFormula).toBe(true)
  expect(formula.childCount).toBeGreaterThan(0)
  expect(formula.type).not.toBe('FabricImage')
  expect(formula.type).not.toBe('Image')

  const beforeEdit = state.history.length
  await dblclickFormula(page, formula)
  await expect(latexInput).toHaveValue('x^2')
  await latexInput.fill('x^3')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()

  state = await waitForState(
    page,
    (s) => s.history.tipType === 'replace' && s.objects.some((o) => o.latex === 'x^3'),
    { timeout: 15000 },
  )
  expect(state.history.length).toBe(beforeEdit + 1)

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.latex === 'x^2'))
  expect(state.objects.some((o) => o.latex === 'x^3')).toBe(false)

  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.latex === 'x^3'))

  const restored = state.objects.find((o) => o.latex === 'x^3')
  await dblclickFormula(page, restored)
  await expect(latexInput).toHaveValue('x^3')
})

test('E2E-P0-005b formula duplicate keeps vector semantics', async ({ page }) => {
  await gotoBoard(page)
  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 300, y: 220 })

  const latexInput = page.getByLabel('LaTeX Formula:')
  await latexInput.fill('y^2')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()

  let state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.formulaType === 'katex-formula' && o.latex === 'y^2'),
    { timeout: 15000 },
  )
  const beforeDup = state.history.length

  await page.keyboard.press('ControlOrMeta+D')
  state = await waitForState(
    page,
    (s) => s.objects.filter((o) => o.formulaType === 'katex-formula' && o.latex === 'y^2').length === 2,
    { timeout: 15000 },
  )
  const formulas = state.objects.filter((o) => o.formulaType === 'katex-formula')
  expect(formulas).toHaveLength(2)
  expect(formulas.every((f) => f.isVectorFormula)).toBe(true)
  expect(state.history.length).toBe(beforeDup + 1)
  expect(state.history.tipType).toBe('duplicate')

  await clickUndo(page)
  state = await waitForState(
    page,
    (s) => s.objects.filter((o) => o.formulaType === 'katex-formula').length === 1,
  )

  await clickRedo(page)
  state = await waitForState(
    page,
    (s) => s.objects.filter((o) => o.formulaType === 'katex-formula').length === 2,
  )
  expect(state.objects.filter((o) => o.isVectorFormula)).toHaveLength(2)
})

test('E2E-P0-005c complex vector formula materializes with padding', async ({ page }) => {
  await gotoBoard(page)
  const latex = String.raw`\frac{\int_0^1 x^2\,dx}{\sqrt{1+\alpha^2}}`
  const state = await insertFormula(page, { latex, x: 360, y: 260 })
  const formula = state.objects.find((o) => o.latex === latex)
  expect(formula).toBeTruthy()
  expect(formula.isVectorFormula).toBe(true)
  expect(formula.childCount).toBeGreaterThan(0)
  expect(formula.width).toBeGreaterThan(0)
  expect(formula.height).toBeGreaterThan(0)
  expect(formula.padding).toBe(12)
  expect(formula.vectorPaints.length).toBeGreaterThan(0)
})

test('E2E-P0-005d formula edit preserves transform after scale and rotate', async ({ page }) => {
  await gotoBoard(page)
  let state = await insertFormula(page, { latex: 'x^2', x: 320, y: 200 })
  const formula = state.objects.find((o) => o.latex === 'x^2')
  expect(formula).toBeTruthy()

  const patched = await page.evaluate(({ latex, patch }) => {
    return window.__MATHBOARD_E2E__.setFormulaTransform(latex, patch)
  }, { latex: 'x^2', patch: { scaleX: 1.8, scaleY: 1.8, angle: 25 } })
  expect(patched).toBe(true)

  state = await getBoardState(page)
  const scaled = state.objects.find((o) => o.latex === 'x^2')
  expect(scaled.scaleX).toBeCloseTo(1.8, 5)
  expect(scaled.scaleY).toBeCloseTo(1.8, 5)
  expect(scaled.angle).toBeCloseTo(25, 5)

  const latexInput = page.getByLabel('LaTeX Formula:')
  await dblclickFormula(page, scaled)
  await latexInput.fill(String.raw`\frac{x}{2}`)
  await page.getByRole('button', { name: 'Insert', exact: true }).click()

  state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.latex === String.raw`\frac{x}{2}`),
    { timeout: 15000 },
  )
  const edited = state.objects.find((o) => o.latex === String.raw`\frac{x}{2}`)
  expect(edited.isVectorFormula).toBe(true)
  expect(edited.scaleX).toBeCloseTo(1.8, 5)
  expect(edited.scaleY).toBeCloseTo(1.8, 5)
  expect(edited.angle).toBeCloseTo(25, 5)
  expect(edited.padding).toBe(12)
})

test('E2E-P0-005e formula render avoids MathJax CDN hosts', async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL || page.url()).origin
  const mathjaxCdnRequests = []

  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === appOrigin) return
    if (MATHJAX_CDN_HOST.test(url.hostname)) {
      mathjaxCdnRequests.push(url.href)
    }
  })

  await gotoBoard(page)
  const richLatex = String.raw`\int_0^1 x^2\,dx + \sum_{n=1}^{\infty}\frac{1}{n^2} + \alpha+\vec{v} + \partial + \begin{matrix}1&2\\3&4\end{matrix}`
  await insertFormula(page, { latex: richLatex, x: 320, y: 220 })

  expect(mathjaxCdnRequests).toEqual([])
})
