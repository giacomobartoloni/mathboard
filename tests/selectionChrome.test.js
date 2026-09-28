import test from 'node:test'
import assert from 'node:assert/strict'
import { selectionChromeForBoard } from '../src/config/selectionChrome.js'

const INK_KEYS = ['stroke', 'fill', 'mathboardInkMode']

test('selection chrome follows the board and does not carry document ink', () => {
  const light = selectionChromeForBoard('light')
  const dark = selectionChromeForBoard('dark')
  const chalk = selectionChromeForBoard('chalkboard')
  const fallback = selectionChromeForBoard('nope')

  assert.notEqual(light.borderColor, dark.borderColor)
  assert.notEqual(dark.borderColor, chalk.borderColor)
  assert.notEqual(light.borderColor, chalk.borderColor)
  assert.deepEqual(fallback, light)

  assert.equal(light.cornerSize, 14)
  assert.equal(light.touchCornerSize, 32)
  assert.ok(light.touchCornerSize > light.cornerSize)

  for (const chrome of [light, dark, chalk]) {
    for (const key of INK_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(chrome, key), false)
    }
  }
})
