import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applySelectionObjectChrome,
  selectionChromeForBoard,
  selectionObjectChromeForBoard,
} from '../src/config/selectionChrome.js'

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

  assert.equal(light.cornerSize, 11)
  assert.equal(light.touchCornerSize, 32)
  assert.ok(light.touchCornerSize > light.cornerSize)

  for (const chrome of [light, dark, chalk]) {
    for (const key of INK_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(chrome, key), false)
    }
  }
})

test('native selection polish keeps marquee separate from object handles', () => {
  const colors = {
    light: 'rgba(21, 101, 192, 0.08)',
    dark: 'rgba(128, 222, 234, 0.10)',
    chalkboard: 'rgba(255, 224, 130, 0.10)',
  }

  for (const [theme, marqueeColor] of Object.entries(colors)) {
    const canvasChrome = selectionChromeForBoard(theme)
    const objectChrome = selectionObjectChromeForBoard(theme)

    assert.equal(canvasChrome.cornerSize, 11)
    assert.equal(canvasChrome.touchCornerSize, 32)
    assert.equal(canvasChrome.borderScaleFactor, 1.35)
    assert.equal(canvasChrome.selectionLineWidth, 1)
    assert.deepEqual(canvasChrome.selectionDashArray, [5, 4])
    assert.equal(canvasChrome.selectionColor, marqueeColor)
    assert.equal(objectChrome.cornerStyle, 'circle')
    assert.equal(objectChrome.transparentCorners, false)
    assert.equal(objectChrome.padding, 4)

    for (const key of ['selectionColor', 'selectionBorderColor', 'selectionLineWidth', 'selectionDashArray']) {
      assert.equal(Object.prototype.hasOwnProperty.call(objectChrome, key), false)
    }
  }

  assert.equal(selectionChromeForBoard('light').cornerColor, '#ffffff')
  assert.equal(selectionChromeForBoard('dark').cornerColor, '#ffffff')
  assert.equal(selectionChromeForBoard('chalkboard').cornerColor, '#fffaf0')
})

test('selection controls hide side midpoints while keeping corners and rotation', () => {
  const makeObject = (type, children = []) => {
    const visibility = {
      tl: true, tr: true, br: true, bl: true, mtr: true,
      mt: true, mr: true, mb: true, ml: true,
    }
    return {
      type,
      visibility,
      padding: 12,
      isType: (...types) => types.includes(type),
      getObjects: () => children,
      set(patch) {
        Object.assign(this, patch)
      },
      setControlsVisibility(patch) {
        Object.assign(visibility, patch)
      },
    }
  }

  const path = makeObject('Path')
  const group = makeObject('Group', [path])
  const activeSelection = makeObject('ActiveSelection')
  const chrome = selectionObjectChromeForBoard('light')

  applySelectionObjectChrome(group, chrome)
  // ActiveSelection is a transient wrapper: apply it when selection changes.
  applySelectionObjectChrome(activeSelection, chrome)

  for (const object of [path, group, activeSelection]) {
    for (const key of ['mt', 'mr', 'mb', 'ml']) {
      assert.equal(object.visibility[key], false, `${object.type}.${key}`)
    }
    for (const key of ['tl', 'tr', 'br', 'bl', 'mtr']) {
      assert.equal(object.visibility[key], true, `${object.type}.${key}`)
    }
    assert.equal(object.padding, 12)
    assert.equal(object.borderColor, chrome.borderColor)
  }
})

test('applySelectionObjectChrome updates nested Group members', () => {
  const darkPatch = selectionObjectChromeForBoard('dark')
  const inner = {
    type: 'line',
    borderColor: '#1565c0',
    set(patch) {
      Object.assign(this, patch)
    },
  }
  const group = {
    type: 'group',
    borderColor: '#1565c0',
    isType: (...types) => types.includes('Group'),
    getObjects: () => [inner],
    set(patch) {
      Object.assign(this, patch)
    },
  }
  applySelectionObjectChrome(group, darkPatch)
  assert.equal(group.borderColor, darkPatch.borderColor)
  assert.equal(inner.borderColor, darkPatch.borderColor)
})

test('selectionObjectChromeForBoard keeps generic padding default', () => {
  assert.equal(selectionObjectChromeForBoard('light').padding, 4)
})

test('applySelectionObjectChrome preserves object-specific padding', () => {
  const darkPatch = selectionObjectChromeForBoard('dark')
  const formulaLike = {
    type: 'group',
    padding: 12,
    borderColor: '#1565c0',
    isType: (...types) => types.includes('Group'),
    getObjects: () => [],
    set(patch) {
      Object.assign(this, patch)
    },
  }

  applySelectionObjectChrome(formulaLike, darkPatch)

  assert.equal(formulaLike.padding, 12)
  assert.equal(formulaLike.borderColor, darkPatch.borderColor)
})

test('applySelectionObjectChrome preserves padding recursively', () => {
  const patch = selectionObjectChromeForBoard('chalkboard')
  const formula = {
    padding: 12,
    borderColor: '#1565c0',
    isType: () => false,
    set(next) {
      Object.assign(this, next)
    },
  }
  const stampRoot = {
    padding: 12,
    borderColor: '#1565c0',
    isType: (...types) => types.includes('Group'),
    getObjects: () => [formula],
    set(next) {
      Object.assign(this, next)
    },
  }

  applySelectionObjectChrome(stampRoot, patch)

  assert.equal(stampRoot.padding, 12)
  assert.equal(formula.padding, 12)
  assert.equal(stampRoot.borderColor, patch.borderColor)
  assert.equal(formula.borderColor, patch.borderColor)
})
