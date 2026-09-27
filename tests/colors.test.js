import test from 'node:test'
import assert from 'node:assert/strict'
import { COLOR_PRESETS, normalizeHexColor } from '../src/config/colors.js'

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
