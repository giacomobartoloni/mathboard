import test from 'node:test'
import assert from 'node:assert/strict'
import { applyMaterializedFormulaMetadata } from '../src/formulas/applyMaterializedFormulaMetadata.js'

test('rematerialized formula keeps renderer polarity when Stamp carries the opposite', () => {
  const formula = {
    mathboardRenderedInkIsLight: true,
    mathboardInkMode: 'auto',
  }

  applyMaterializedFormulaMetadata(formula, {
    latex: 'x',
    mathboardRenderedInkIsLight: false,
    mathboardInkMode: 'auto',
  })

  assert.equal(formula.mathboardRenderedInkIsLight, true)
  assert.equal(formula.mathboardInkMode, 'auto')
})

test('rematerialized formula restores mathboardInkMode from Stamp', () => {
  const formula = {
    mathboardRenderedInkIsLight: false,
    mathboardInkMode: 'auto',
  }

  applyMaterializedFormulaMetadata(formula, {
    latex: 'x',
    mathboardInkMode: 'fixed',
    mathboardRenderedInkIsLight: true,
  })

  assert.equal(formula.mathboardInkMode, 'fixed')
  assert.equal(formula.mathboardRenderedInkIsLight, false)
})

test('missing ink mode in Spec leaves formula ink mode untouched', () => {
  const formula = {
    mathboardRenderedInkIsLight: true,
    mathboardInkMode: 'auto',
  }

  applyMaterializedFormulaMetadata(formula, { latex: 'x' })

  assert.equal(formula.mathboardInkMode, 'auto')
  assert.equal(formula.mathboardRenderedInkIsLight, true)
})
