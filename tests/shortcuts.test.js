import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isDeleteShortcut,
  isEscapeShortcut,
  isGroupShortcut,
  isPlainToolKey,
  isRedoShortcut,
  isShareStampLinkShortcut,
  isUngroupShortcut,
  isUndoShortcut,
  SHORTCUT_HELP,
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

test('share stamp link is ctrl or meta plus shift-l', () => {
  assert.equal(isShareStampLinkShortcut({ key: 'l', ctrlKey: true, shiftKey: true }), true)
  assert.equal(isShareStampLinkShortcut({ key: 'L', metaKey: true, shiftKey: true }), true)
  assert.equal(isShareStampLinkShortcut({ key: 'l', ctrlKey: true }), false)
  assert.equal(isShareStampLinkShortcut({ key: 'l', ctrlKey: true, shiftKey: true, altKey: true }), false)
  assert.equal(isShareStampLinkShortcut({ key: 'g', ctrlKey: true, shiftKey: true }), false)
})

test('SHORTCUT_HELP lists shipped groups and share link', () => {
  assert.deepEqual(
    SHORTCUT_HELP.map((section) => section.group),
    ['Tools', 'Edit', 'Other'],
  )
  const edit = SHORTCUT_HELP.find((section) => section.group === 'Edit')
  const share = edit?.items.find((item) => item.id === 'share')
  assert.equal(share?.label, 'Share link')
  assert.equal(share?.keys, 'Ctrl/Cmd+Shift+L')
  assert.match(share?.hint || '', /Select objects first/)
})
