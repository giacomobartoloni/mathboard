import test from 'node:test'
import assert from 'node:assert/strict'
import { applyExplicitInk, COLOR_PRESETS, normalizeHexColor } from '../src/config/colors.js'

const EXPECTED = [
  ['black', 'Black', '#000000'],
  ['white', 'White', '#ffffff'],
  ['red', 'Red', '#d32f2f'],
  ['blue', 'Blue', '#1976d2'],
  ['green', 'Green', '#2e7d32'],
  ['orange', 'Orange', '#ef6c00'],
  ['purple', 'Purple', '#6a1b9a'],
  ['yellow', 'Yellow', '#f9a825'],
]

test('COLOR_PRESETS lists the eight teaching colors in order', () => {
  assert.equal(COLOR_PRESETS.length, 8)
  EXPECTED.forEach(([id, label, value], index) => {
    assert.deepEqual(COLOR_PRESETS[index], { id, label, value })
  })
})

test('normalizeHexColor accepts only six-digit hex', () => {
  assert.equal(normalizeHexColor('#ABCDEF'), '#abcdef')
  assert.equal(normalizeHexColor('  #00ff00  '), '#00ff00')
  assert.equal(normalizeHexColor(null), null)
  assert.equal(normalizeHexColor(123), null)
  assert.equal(normalizeHexColor('#fff'), null)
  assert.equal(normalizeHexColor('#ffffffff'), null)
  assert.equal(normalizeHexColor('red'), null)
})

test('applyExplicitInk recolors a selected stroke, shape, or text and locks it', () => {
  const path = { type: 'path', stroke: '#000000', fill: null, mathboardInkMode: 'auto' }
  assert.equal(applyExplicitInk(path, '#D32F2F'), true)
  assert.equal(path.stroke, '#d32f2f')
  assert.equal(path.fill, null)
  assert.equal(path.mathboardInkMode, 'fixed')

  for (const type of ['rect', 'circle', 'line']) {
    const shape = { type, stroke: '#000000', fill: 'transparent', mathboardInkMode: 'auto' }
    assert.equal(applyExplicitInk(shape, '#2e7d32'), true)
    assert.equal(shape.stroke, '#2e7d32')
    assert.equal(shape.fill, 'transparent')
    assert.equal(shape.mathboardInkMode, 'fixed')
  }

  const text = { type: 'i-text', fill: '#000000', mathboardInkMode: 'auto' }
  assert.equal(applyExplicitInk(text, '#1976d2'), true)
  assert.equal(text.fill, '#1976d2')
  assert.equal(text.mathboardInkMode, 'fixed')

  const plainText = { type: 'text', fill: '#000000', mathboardInkMode: 'auto' }
  assert.equal(applyExplicitInk(plainText, '#f9a825'), true)
  assert.equal(plainText.fill, '#f9a825')
})

test('applyExplicitInk leaves formulas and unselected-style objects alone', () => {
  const formula = { type: 'image', formulaType: 'katex-formula', stroke: '#000000' }
  assert.equal(applyExplicitInk(formula, '#d32f2f'), false)
  assert.equal(formula.stroke, '#000000')

  const group = { type: 'group', stroke: '#000000' }
  assert.equal(applyExplicitInk(group, '#d32f2f'), false)
  assert.equal(group.stroke, '#000000')

  const already = { type: 'path', stroke: '#d32f2f', mathboardInkMode: 'fixed' }
  assert.equal(applyExplicitInk(already, '#d32f2f'), false)

  const automaticBlack = { type: 'path', stroke: '#000000', mathboardInkMode: 'auto' }
  assert.equal(applyExplicitInk(automaticBlack, '#000000'), true)
  assert.equal(automaticBlack.stroke, '#000000')
  assert.equal(automaticBlack.mathboardInkMode, 'fixed')

  assert.equal(applyExplicitInk({ type: 'path', stroke: '#000000' }, 'red'), false)
  assert.equal(applyExplicitInk(null, '#000000'), false)
})

test('applyExplicitInk prefers the object set method', () => {
  const calls = []
  const path = {
    type: 'rect',
    stroke: '#000000',
    mathboardInkMode: 'auto',
    set(patch) {
      calls.push(patch)
      Object.assign(this, patch)
    },
  }
  assert.equal(applyExplicitInk(path, '#ffffff'), true)
  assert.deepEqual(calls, [{ stroke: '#ffffff', mathboardInkMode: 'fixed' }])
})
