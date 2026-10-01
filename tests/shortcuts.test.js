import test from 'node:test'
import assert from 'node:assert/strict'
import { COLOR_PRESETS } from '../src/config/colors.js'
import {
  isDeleteShortcut,
  isDuplicateShortcut,
  isEscapeShortcut,
  isGroupShortcut,
  isPlainColorDigit,
  isPlainShapeKey,
  isPlainToolKey,
  isRedoShortcut,
  isSelectAllShortcut,
  isUngroupShortcut,
  isUndoShortcut,
  isZoomInShortcut,
  isZoomOutShortcut,
  isZoomResetShortcut,
  shouldIgnoreGlobalShortcut,
} from '../src/config/shortcuts.js'

test('plain tool keys map to tool ids', () => {
  assert.equal(isPlainToolKey({ key: 'v' }), 'select')
  assert.equal(isPlainToolKey({ key: 'p' }), 'pencil')
  assert.equal(isPlainToolKey({ key: 'h' }), 'pan')
  assert.equal(isPlainToolKey({ key: 't' }), 'font')
  assert.equal(isPlainToolKey({ key: 'f' }), 'formula')
  assert.equal(isPlainToolKey({ key: 's' }), 'shapes')
  assert.equal(isPlainToolKey({ key: 'V' }), 'select')
})

test('modified or repeated tool keys are not shortcuts', () => {
  assert.equal(isPlainToolKey({ key: 'v', shiftKey: true }), null)
  assert.equal(isPlainToolKey({ key: 'f', ctrlKey: true }), null)
  assert.equal(isPlainToolKey({ key: 'p', metaKey: true }), null)
  assert.equal(isPlainToolKey({ key: 't', altKey: true }), null)
  assert.equal(isPlainToolKey({ key: 'v', repeat: true }), null)
})

test('shouldIgnoreGlobalShortcut detects editable targets', () => {
  assert.equal(shouldIgnoreGlobalShortcut({ target: { tagName: 'INPUT' } }), true)
  assert.equal(shouldIgnoreGlobalShortcut({ target: { tagName: 'TEXTAREA' } }), true)
  assert.equal(shouldIgnoreGlobalShortcut({ target: { tagName: 'SELECT' } }), true)
  assert.equal(shouldIgnoreGlobalShortcut({
    target: { tagName: 'DIV', isContentEditable: true },
  }), true)
  assert.equal(shouldIgnoreGlobalShortcut({
    target: {
      tagName: 'SPAN',
      isContentEditable: false,
      closest: (selector) => (selector === '[contenteditable="true"]' ? {} : null),
    },
  }), true)
  assert.equal(shouldIgnoreGlobalShortcut({
    target: { tagName: 'DIV', isContentEditable: false, closest: () => null },
  }), false)
  assert.equal(shouldIgnoreGlobalShortcut({}), false)
})

test('undo is ctrl or meta plus z without shift or alt', () => {
  assert.equal(isUndoShortcut({ key: 'z', ctrlKey: true }), true)
  assert.equal(isUndoShortcut({ key: 'Z', metaKey: true }), true)
  assert.equal(isUndoShortcut({ key: 'z', ctrlKey: true, shiftKey: true }), false)
  assert.equal(isUndoShortcut({ key: 'z', ctrlKey: true, altKey: true }), false)
  assert.equal(isUndoShortcut({ key: 'z' }), false)
})

test('redo is ctrl or meta plus shift-z, or ctrl or meta plus y', () => {
  assert.equal(isRedoShortcut({ key: 'z', ctrlKey: true, shiftKey: true }), true)
  assert.equal(isRedoShortcut({ key: 'Z', metaKey: true, shiftKey: true }), true)
  assert.equal(isRedoShortcut({ key: 'y', ctrlKey: true }), true)
  assert.equal(isRedoShortcut({ key: 'Y', metaKey: true }), true)
  assert.equal(isRedoShortcut({ key: 'z', ctrlKey: true }), false)
  assert.equal(isRedoShortcut({ key: 'y', ctrlKey: true, shiftKey: true }), false)
  assert.equal(isRedoShortcut({ key: 'y' }), false)
})

test('delete and escape classification', () => {
  assert.equal(isDeleteShortcut({ key: 'Delete' }), true)
  assert.equal(isDeleteShortcut({ key: 'Backspace' }), true)
  assert.equal(isDeleteShortcut({ key: 'Backspace', ctrlKey: true }), false)
  assert.equal(isDeleteShortcut({ key: 'Delete', metaKey: true }), false)
  assert.equal(isEscapeShortcut({ key: 'Escape' }), true)
  assert.equal(isEscapeShortcut({ key: 'Esc' }), false)
})

test('group and ungroup shortcuts', () => {
  assert.equal(isGroupShortcut({ key: 'g', ctrlKey: true }), true)
  assert.equal(isGroupShortcut({ key: 'G', metaKey: true }), true)
  assert.equal(isGroupShortcut({ key: 'g', ctrlKey: true, shiftKey: true }), false)
  assert.equal(isUngroupShortcut({ key: 'g', ctrlKey: true, shiftKey: true }), true)
  assert.equal(isUngroupShortcut({ key: 'G', metaKey: true, shiftKey: true }), true)
  assert.equal(isUngroupShortcut({ key: 'g', ctrlKey: true }), false)
})

test('zoom in is ctrl or meta plus + or = (shift allowed for +)', () => {
  assert.equal(isZoomInShortcut({ key: '=', ctrlKey: true }), true)
  assert.equal(isZoomInShortcut({ key: '+', ctrlKey: true, shiftKey: true }), true)
  assert.equal(isZoomInShortcut({ key: '+', metaKey: true }), true)
  assert.equal(isZoomInShortcut({ key: '=', metaKey: true }), true)
  assert.equal(isZoomInShortcut({ key: '=', ctrlKey: true, altKey: true }), false)
  assert.equal(isZoomInShortcut({ key: '=' }), false)
  assert.equal(isZoomInShortcut({ key: '-', ctrlKey: true }), false)
})

test('zoom out is ctrl or meta plus -', () => {
  assert.equal(isZoomOutShortcut({ key: '-', ctrlKey: true }), true)
  assert.equal(isZoomOutShortcut({ key: '-', metaKey: true }), true)
  assert.equal(isZoomOutShortcut({ key: '_', ctrlKey: true, shiftKey: true }), true)
  assert.equal(isZoomOutShortcut({ key: '-', ctrlKey: true, altKey: true }), false)
  assert.equal(isZoomOutShortcut({ key: '-' }), false)
  assert.equal(isZoomOutShortcut({ key: '=', ctrlKey: true }), false)
})

test('zoom reset is ctrl or meta plus 0', () => {
  assert.equal(isZoomResetShortcut({ key: '0', ctrlKey: true }), true)
  assert.equal(isZoomResetShortcut({ key: '0', metaKey: true }), true)
  assert.equal(isZoomResetShortcut({ key: '0', ctrlKey: true, shiftKey: true }), false)
  assert.equal(isZoomResetShortcut({ key: '0' }), false)
})

test('duplicate is ctrl or meta plus d', () => {
  assert.equal(isDuplicateShortcut({ key: 'd', ctrlKey: true }), true)
  assert.equal(isDuplicateShortcut({ key: 'D', metaKey: true }), true)
  assert.equal(isDuplicateShortcut({ key: 'd', ctrlKey: true, shiftKey: true }), false)
  assert.equal(isDuplicateShortcut({ key: 'd', ctrlKey: true, altKey: true }), false)
  assert.equal(isDuplicateShortcut({ key: 'd' }), false)
})

test('select all is ctrl or meta plus a', () => {
  assert.equal(isSelectAllShortcut({ key: 'a', ctrlKey: true }), true)
  assert.equal(isSelectAllShortcut({ key: 'A', metaKey: true }), true)
  assert.equal(isSelectAllShortcut({ key: 'a', ctrlKey: true, shiftKey: true }), false)
  assert.equal(isSelectAllShortcut({ key: 'a', ctrlKey: true, altKey: true }), false)
  assert.equal(isSelectAllShortcut({ key: 'a' }), false)
})

test('plain shape keys map to shape ids', () => {
  assert.equal(isPlainShapeKey({ key: 'r' }), 'rectangle')
  assert.equal(isPlainShapeKey({ key: 'R' }), 'rectangle')
  assert.equal(isPlainShapeKey({ key: 'c' }), 'circle')
  assert.equal(isPlainShapeKey({ key: 'l' }), 'arrow')
  assert.equal(isPlainShapeKey({ key: 'r', shiftKey: true }), null)
  assert.equal(isPlainShapeKey({ key: 'r', ctrlKey: true }), null)
  assert.equal(isPlainShapeKey({ key: 'r', repeat: true }), null)
})

test('plain color digits map to COLOR_PRESETS order', () => {
  assert.equal(isPlainColorDigit({ key: '1' }), COLOR_PRESETS[0])
  assert.equal(isPlainColorDigit({ key: '2' }), COLOR_PRESETS[1])
  assert.equal(isPlainColorDigit({ key: '3' }), COLOR_PRESETS[2])
  assert.equal(isPlainColorDigit({ key: '4' }), COLOR_PRESETS[3])
  assert.equal(isPlainColorDigit({ key: '5' }), COLOR_PRESETS[4])
  assert.equal(COLOR_PRESETS[0].value, null)
  assert.equal(isPlainColorDigit({ key: '6' }), null)
  assert.equal(isPlainColorDigit({ key: '1', ctrlKey: true }), null)
  assert.equal(isPlainColorDigit({ key: '2', shiftKey: true }), null)
  assert.equal(isPlainColorDigit({ key: '3', repeat: true }), null)
})
