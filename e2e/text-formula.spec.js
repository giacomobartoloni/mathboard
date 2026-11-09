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
import {
  CURSOR,
  SELECTION,
  QUICK_INSERT_ITEMS,
  LATEX_PALETTE_GROUPS,
} from '../src/config/latexPalette.js'

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
  await expect(page.getByRole('heading', { name: 'Insert Formula (LaTeX)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Insert', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toHaveCount(0)
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
  await expect(page.getByRole('heading', { name: 'Edit Formula (LaTeX)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Insert', exact: true })).toHaveCount(0)
  await latexInput.fill('x^3')
  await page.getByRole('button', { name: 'Update', exact: true }).click()

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
  let state = await insertFormula(page, { latex, x: 360, y: 260 })
  const formula = state.objects.find((o) => o.latex === latex)
  expect(formula).toBeTruthy()
  expect(formula.isVectorFormula).toBe(true)
  expect(formula.childCount).toBeGreaterThan(0)
  expect(formula.width).toBeGreaterThan(0)
  expect(formula.height).toBeGreaterThan(0)
  expect(formula.padding).toBe(12)
  expect(formula.vectorPaints.length).toBeGreaterThan(0)

  // Light → Dark refreshes selection chrome without resetting Formula padding.
  await page.getByRole('button', { name: /Theme:/ }).click()
  state = await waitForState(
    page,
    (s) => {
      const next = s.objects.find((o) => o.latex === latex)
      return Boolean(
        next
        && next.vectorPaints.length > 0
        && next.vectorPaints.every((paint) => paint === '#f5f5f5'),
      )
    },
    { timeout: 15000 },
  )
  expect(state.objects.find((o) => o.latex === latex).padding).toBe(12)
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
  await page.getByRole('button', { name: 'Update', exact: true }).click()

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

test('E2E-P0-005f boldsymbol preview matches editable vector insertion', async ({ page }) => {
  await gotoBoard(page)
  const plainLatex = String.raw`\alpha+\beta`
  const boldLatex = String.raw`\boldsymbol{\alpha}+\boldsymbol{\beta}`
  let state = await insertFormula(page, { latex: plainLatex, x: 300, y: 180 })
  const plainFormula = state.objects.find((object) => object.latex === plainLatex)
  expect(plainFormula).toBeTruthy()

  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 300, y: 310 })
  const latexInput = page.getByLabel('LaTeX Formula:')
  await latexInput.fill(boldLatex)
  await expect(page.locator('.preview-box .katex')).toBeVisible()
  await page.getByRole('button', { name: 'Insert', exact: true }).click()

  state = await waitForState(
    page,
    (s) => s.objects.some((o) => o.latex === boldLatex),
    { timeout: 15000 },
  )
  const boldFormula = state.objects.find((object) => object.latex === boldLatex)
  expect(boldFormula.isVectorFormula).toBe(true)
  expect(boldFormula.childCount).toBeGreaterThan(0)
  expect(boldFormula.width).toBeGreaterThan(0)
  expect(boldFormula.width).toBeLessThan(plainFormula.width * 2)

  await dblclickFormula(page, boldFormula)
  await expect(latexInput).toHaveValue(boldLatex)
  const editedLatex = String.raw`\boldsymbol{x}+\boldsymbol{\nabla}`
  await latexInput.fill(editedLatex)
  await page.getByRole('button', { name: 'Update', exact: true }).click()

  state = await waitForState(
    page,
    (s) => s.history.tipType === 'replace' && s.objects.some((o) => o.latex === editedLatex),
    { timeout: 15000 },
  )
  expect(state.objects.find((object) => object.latex === editedLatex).isVectorFormula).toBe(true)
  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.latex === boldLatex))
  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.latex === editedLatex))
  expect(state.objects.find((object) => object.latex === editedLatex).childCount).toBeGreaterThan(0)
})

test('E2E-P0-005i cancel preview creates an editable vector strike-through', async ({ page }) => {
  await gotoBoard(page)
  const plainLatex = 'A+B'
  const cancelLatex = String.raw`A+\cancel{B}`
  const editedLatex = String.raw`A+\xcancel{B}`

  let state = await insertFormula(page, { latex: plainLatex, x: 300, y: 170 })
  const plainFormula = state.objects.find((object) => object.latex === plainLatex)
  expect(plainFormula).toBeTruthy()

  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 300, y: 290 })
  const latexInput = page.getByLabel('LaTeX Formula:')
  await latexInput.fill(cancelLatex)
  await expect(page.locator('.preview-box .katex')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Insert', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Insert', exact: true }).click()

  state = await waitForState(page,
    (s) => s.objects.some((o) => o.latex === cancelLatex), { timeout: 15000 })
  const canceled = state.objects.find((object) => object.latex === cancelLatex)
  expect(canceled.isVectorFormula).toBe(true)
  expect(canceled.childCount).toBeGreaterThan(plainFormula.childCount)
  expect(canceled.width).toBeGreaterThan(0)

  await dblclickFormula(page, canceled)
  await expect(latexInput).toHaveValue(cancelLatex)
  await latexInput.fill(editedLatex)
  await page.getByRole('button', { name: 'Update', exact: true }).click()
  state = await waitForState(page,
    (s) => s.history.tipType === 'replace' && s.objects.some((o) => o.latex === editedLatex),
    { timeout: 15000 })
  expect(state.objects.find((object) => object.latex === editedLatex).isVectorFormula).toBe(true)

  await clickUndo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.latex === cancelLatex))
  await clickRedo(page)
  state = await waitForState(page, (s) => s.objects.some((o) => o.latex === editedLatex))
  expect(state.objects.find((object) => object.latex === editedLatex).childCount).toBeGreaterThan(0)
})

for (const { packageName, latex } of [
  { packageName: 'mathtools', latex: String.raw`a\coloneqq b` },
  { packageName: 'extpfeil', latex: String.raw`a\xmapsto{f}b` },
  { packageName: 'braket', latex: String.raw`\braket{\phi|\psi}` },
]) {
  test(`E2E-P0-005j ${packageName} has matching KaTeX preview and board vector`, async ({ page }) => {
    await gotoBoard(page)
    await selectTool(page, 'Formula')
    await clickOnCanvas(page, { x: 330, y: 230 })
    const latexInput = page.getByLabel('LaTeX Formula:')
    await latexInput.fill(latex)
    await expect(page.locator('.preview-box .katex')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Insert', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    const state = await waitForState(page,
      (s) => s.objects.some((object) => object.latex === latex), { timeout: 15000 })
    const formula = state.objects.find((object) => object.latex === latex)
    expect(formula.isVectorFormula).toBe(true)
    expect(formula.childCount).toBeGreaterThan(0)
    expect(formula.width).toBeGreaterThan(0)
    expect(formula.height).toBeGreaterThan(0)
  })
}

test('E2E-P0-005e dynamic NewCM ranges load without CDN', async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL || page.url()).origin
  const mathjaxCdnRequests = []
  const errors = []

  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === appOrigin) return
    if (MATHJAX_CDN_HOST.test(url.hostname)) {
      mathjaxCdnRequests.push(url.href)
    }
  })

  await gotoBoard(page)
  // Force NewCM dynamic ranges (double-struck / calligraphic / fraktur).
  const richLatex = String.raw`\mathbb{R} + \mathcal{L} + \mathfrak{g}`
  const state = await insertFormula(page, { latex: richLatex, x: 320, y: 220 })
  const formula = state.objects.find((object) => object.latex === richLatex)

  expect(formula).toBeTruthy()
  expect(formula.isVectorFormula).toBe(true)
  expect(formula.childCount).toBeGreaterThan(0)
  expect(formula.width).toBeGreaterThan(0)
  expect(formula.height).toBeGreaterThan(0)
  expect(formula.vectorPaints.length).toBeGreaterThan(0)
  expect(errors).toEqual([])
  expect(mathjaxCdnRequests).toEqual([])
})


test('E2E-P0-005g every Quick Insert keeps cursor and selection semantics', async ({ page }) => {
  await gotoBoard(page)
  await selectTool(page, 'Formula')
  await clickOnCanvas(page, { x: 340, y: 240 })

  const input = page.getByLabel('LaTeX Formula:')
  const submit = page.getByRole('button', { name: 'Insert', exact: true })

  for (const item of QUICK_INSERT_ITEMS) {
    const button = page.getByRole('button', { name: item.ariaLabel, exact: true })
    await expect(button.locator('.katex')).toBeVisible()
    await input.fill('')
    await button.click()

    const expected = item.template.replaceAll(CURSOR, '').replaceAll(SELECTION, '')
    await expect(input).toHaveValue(expected)
    await expect.poll(async () => input.evaluate((element) => element.selectionStart))
      .toBe(item.template.indexOf(CURSOR))

    await input.fill(item.preview)
    await expect(page.locator('.preview-box .katex')).toBeVisible()
    await expect(submit).toBeEnabled()

    if (item.selectionTemplate) {
      await input.fill('xy')
      await input.evaluate((element) => element.setSelectionRange(0, 2))
      await button.click()
      const withSelection = item.selectionTemplate.replaceAll(SELECTION, 'xy')
      await expect(input).toHaveValue(withSelection.replaceAll(CURSOR, ''))
      await expect.poll(async () => input.evaluate((element) => element.selectionStart))
        .toBe(withSelection.indexOf(CURSOR))
    }
  }
})

for (const group of LATEX_PALETTE_GROUPS) {
  test('E2E-P0-005h every ' + group.id + ' palette symbol inserts and previews', async ({ page }) => {
    await gotoBoard(page)
    await selectTool(page, 'Formula')
    await clickOnCanvas(page, { x: 340, y: 240 })
    await page.getByRole('tab', { name: group.label, exact: true }).click()

    const panel = page.getByRole('tabpanel', { name: group.label, exact: true })
    const input = page.getByLabel('LaTeX Formula:')
    const submit = page.getByRole('button', { name: 'Insert', exact: true })

    for (const item of group.items) {
      const button = panel.getByRole('button', { name: item.ariaLabel, exact: true })
      await expect(button.locator('.katex')).toBeVisible()
      await input.fill('x')
      await button.click()
      await expect(input).toHaveValue('x' + item.template)
      await expect(page.locator('.preview-box .katex')).toBeVisible()
      await expect(submit).toBeEnabled()
    }
  })
}

const FORMULA_TOOLBAR_BOARD_CASES = [
  {
    id: 'mathbf',
    action: 'Insert bold upright math',
    latex: '\\mathbf{A}+\\mathbf{B}',
  },
  {
    id: 'bmatrix',
    action: 'Insert matrix',
    latex: '\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}',
  },
  {
    id: 'symbols',
    group: 'Symbols',
    action: 'Insert times',
    latex: 'x\\times y',
  },
  {
    id: 'greek',
    group: 'Greek',
    action: 'Insert alpha',
    latex: '\\alpha+\\beta',
  },
  {
    id: 'relations',
    group: 'Relations',
    action: 'Insert less than or equal',
    latex: 'x\\leq y',
  },
]

for (const sample of FORMULA_TOOLBAR_BOARD_CASES) {
  test('E2E-P0-005i ' + sample.id + ' preview becomes editable MathJax vectors', async ({ page }) => {
    await gotoBoard(page)
    await selectTool(page, 'Formula')
    await clickOnCanvas(page, { x: 340, y: 240 })

    if (sample.group) {
      await page.getByRole('tab', { name: sample.group, exact: true }).click()
    }
    await page.getByRole('button', { name: sample.action, exact: true }).click()

    const input = page.getByLabel('LaTeX Formula:')
    await input.fill(sample.latex)
    await expect(page.locator('.preview-box .katex')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Insert', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Insert', exact: true }).click()

    const state = await waitForState(
      page,
      (next) => next.objects.some((object) => object.latex === sample.latex),
      { timeout: 15000 },
    )
    const formula = state.objects.find((object) => object.latex === sample.latex)
    expect(formula.isVectorFormula).toBe(true)
    expect(formula.childCount).toBeGreaterThan(0)
    expect(formula.width).toBeGreaterThan(0)
    expect(formula.height).toBeGreaterThan(0)
    expect(formula.vectorPaints.length).toBeGreaterThan(0)

    await dblclickFormula(page, formula)
    await expect(input).toHaveValue(sample.latex)
  })
}
