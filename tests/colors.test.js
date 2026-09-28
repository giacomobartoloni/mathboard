import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyAutoInk,
  applyExplicitInk,
  COLOR_PRESETS,
  normalizeHexColor,
  paletteColorFromObject,
  paletteColorFromSelection,
} from '../src/config/colors.js'

const EXPECTED = [
  ['main', 'Main', null],
  ['red', 'Red', '#d32f2f'],
  ['yellow', 'Yellow', '#f9a825'],
  ['blue', 'Blue', '#1976d2'],
  ['green', 'Green', '#2e7d32'],
]

test('COLOR_PRESETS lists main plus four teaching colors in order', () => {
  assert.equal(COLOR_PRESETS.length, 5)
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

test('applyAutoInk restores board default ink and unlocks theme follow', () => {
  const path = { type: 'path', stroke: '#d32f2f', mathboardInkMode: 'fixed' }
  assert.equal(applyAutoInk(path, '#000000'), true)
  assert.equal(path.stroke, '#000000')
  assert.equal(path.mathboardInkMode, 'auto')

  assert.equal(applyAutoInk(path, '#000000'), false)

  const text = { type: 'i-text', fill: '#1976d2', mathboardInkMode: 'fixed' }
  assert.equal(applyAutoInk(text, '#f5f5f5'), true)
  assert.equal(text.fill, '#f5f5f5')
  assert.equal(text.mathboardInkMode, 'auto')

  assert.equal(applyAutoInk({ type: 'image', formulaType: 'katex-formula' }, '#000000'), false)
})

test('paletteColorFromObject maps fixed stroke/fill to hex and auto to null', () => {
  assert.equal(
    paletteColorFromObject({ type: 'path', stroke: '#D32F2F', mathboardInkMode: 'fixed' }),
    '#d32f2f',
  )
  assert.equal(
    paletteColorFromObject({ type: 'rect', stroke: '#1976d2', mathboardInkMode: 'fixed' }),
    '#1976d2',
  )
  assert.equal(
    paletteColorFromObject({ type: 'i-text', fill: '#2e7d32', mathboardInkMode: 'fixed' }),
    '#2e7d32',
  )
  assert.equal(
    paletteColorFromObject({ type: 'path', stroke: '#000000', mathboardInkMode: 'auto' }),
    null,
  )
  assert.equal(
    paletteColorFromObject({ type: 'path', stroke: '#000000' }),
    null,
  )
  assert.equal(
    paletteColorFromObject({ type: 'image', formulaType: 'katex-formula', stroke: '#d32f2f' }),
    undefined,
  )
  assert.equal(paletteColorFromObject({ type: 'group', stroke: '#d32f2f' }), undefined)
  assert.equal(paletteColorFromObject(null), undefined)
})

test('paletteColorFromSelection agrees on one palette value or abstains', () => {
  assert.equal(
    paletteColorFromSelection([
      { type: 'path', stroke: '#d32f2f', mathboardInkMode: 'fixed' },
      { type: 'rect', stroke: '#D32F2F', mathboardInkMode: 'fixed' },
    ]),
    '#d32f2f',
  )
  assert.equal(
    paletteColorFromSelection([
      { type: 'path', stroke: '#000000', mathboardInkMode: 'auto' },
      { type: 'i-text', fill: '#ffffff', mathboardInkMode: 'auto' },
    ]),
    null,
  )
  assert.equal(
    paletteColorFromSelection([
      { type: 'path', stroke: '#d32f2f', mathboardInkMode: 'fixed' },
      { type: 'path', stroke: '#1976d2', mathboardInkMode: 'fixed' },
    ]),
    undefined,
  )
  assert.equal(
    paletteColorFromSelection([
      { type: 'path', stroke: '#d32f2f', mathboardInkMode: 'fixed' },
      { type: 'image', formulaType: 'katex-formula' },
    ]),
    '#d32f2f',
  )
  assert.equal(paletteColorFromSelection([]), undefined)
  assert.equal(paletteColorFromSelection(null), undefined)
})
