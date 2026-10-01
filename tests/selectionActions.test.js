import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTION_DELETE,
  ACTION_DUPLICATE,
  ACTION_EDIT,
  ACTION_GROUP,
  ACTION_UNGROUP,
  EMPTY_SELECTION,
  panelSize,
  sceneBoxToViewport,
  selectionActions,
  selectionKind,
  selectionMeta,
  selectionPanelPosition,
} from '../src/config/selectionActions.js'

function objectOf(type, extra = {}) {
  return {
    type,
    isType: (...types) => types.includes(type),
    ...extra,
  }
}

test('selection meta is empty without an object', () => {
  assert.equal(selectionKind(null), null)
  assert.deepEqual(selectionMeta(null), { ...EMPTY_SELECTION, actions: [] })
  assert.deepEqual(selectionActions(null), [])
})

test('formula is the only single selection that offers Edit', () => {
  const formula = objectOf('image', { formulaType: 'katex-formula', latex: 'x^2' })
  assert.equal(selectionKind(formula), 'formula')
  assert.deepEqual(selectionMeta(formula).actions, [ACTION_EDIT, ACTION_DUPLICATE, ACTION_DELETE])

  const tagged = objectOf('image', { objectKind: 'formula' })
  assert.equal(selectionKind(tagged), 'formula')

  const plainImage = objectOf('image')
  assert.equal(selectionKind(plainImage), 'unknown')
  assert.deepEqual(selectionActions('unknown'), [ACTION_DUPLICATE, ACTION_DELETE])
})

test('text, path, and shape do not get a type-specific Edit action', () => {
  assert.equal(selectionKind(objectOf('IText')), 'text')
  assert.equal(selectionKind(objectOf('Path')), 'path')
  assert.equal(selectionKind(objectOf('Rect')), 'shape')
  assert.equal(selectionKind(objectOf('Line')), 'shape')
  for (const kind of ['text', 'path', 'shape']) {
    assert.deepEqual(selectionActions(kind), [ACTION_DUPLICATE, ACTION_DELETE])
  }
})

test('multi-selection offers Group with duplicate and delete', () => {
  const multi = {
    type: 'activeselection',
    isType: (...types) => types.includes('ActiveSelection'),
    getObjects: () => [
      objectOf('image', { formulaType: 'katex-formula' }),
      objectOf('Rect'),
    ],
  }
  const meta = selectionMeta(multi)
  assert.equal(meta.selectionType, 'activeSelection')
  assert.equal(meta.selectionCount, 2)
  assert.deepEqual(meta.actions, [ACTION_GROUP, ACTION_DUPLICATE, ACTION_DELETE])
  assert.deepEqual(selectionMeta({ ...multi, getObjects: () => [] }), { ...EMPTY_SELECTION, actions: [] })
})

test('permanent group offers Ungroup', () => {
  const group = objectOf('Group')
  assert.equal(selectionKind(group), 'group')
  assert.deepEqual(selectionActions('group'), [ACTION_UNGROUP, ACTION_DUPLICATE, ACTION_DELETE])
})

test('panel height follows the action count', () => {
  assert.deepEqual(panelSize(0), { width: 0, height: 0 })
  const two = panelSize(2)
  const three = panelSize(3)
  assert.ok(three.height > two.height)
  assert.equal(two.width, three.width)
  assert.equal(two.width, 52)
})

test('scene box follows zoom and pan and stays axis-aligned', () => {
  const box = { left: 10, top: 20, width: 30, height: 40 }
  assert.deepEqual(sceneBoxToViewport(box, [1, 0, 0, 1, 0, 0]), {
    left: 10, top: 20, width: 30, height: 40,
  })
  assert.deepEqual(sceneBoxToViewport(box, [2, 0, 0, 2, 5, -4]), {
    left: 25, top: 36, width: 60, height: 80,
  })
  assert.equal(sceneBoxToViewport(box, null), null)
})

test('panel prefers the right, sits above the top edge, and clamps to the viewport', () => {
  const panel = { width: 52, height: 100 }
  const viewport = { left: 0, top: 0, width: 400, height: 300 }

  const right = selectionPanelPosition({
    frame: { left: 100, top: 120, width: 40, height: 40 },
    viewport,
    panel,
  })
  assert.equal(right.placement, 'right')
  assert.equal(right.x, 100 + 40 + 20)
  assert.equal(right.y, 100)

  const left = selectionPanelPosition({
    frame: { left: 360, top: 40, width: 30, height: 20 },
    viewport,
    panel,
  })
  assert.equal(left.placement, 'left')
  assert.equal(left.x, 360 - 20 - 52)
  assert.equal(left.y, 20)

  const nearTop = selectionPanelPosition({
    frame: { left: 100, top: 2, width: 40, height: 20 },
    viewport,
    panel,
  })
  assert.equal(nearTop.placement, 'right')
  assert.equal(nearTop.y, 8)

  const huge = selectionPanelPosition({
    frame: { left: -100, top: -100, width: 800, height: 600 },
    viewport,
    panel,
  })
  assert.ok(huge.x >= 8)
  assert.ok(huge.y >= 8)
  assert.ok(huge.x + panel.width <= viewport.width - 8)
  assert.ok(huge.y + panel.height <= viewport.height - 8)
})
