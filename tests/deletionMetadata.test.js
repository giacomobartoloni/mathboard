import test from 'node:test'
import assert from 'node:assert/strict'
import { buildObjectDeletedMetadata } from '../src/analytics/deletionMetadata.js'
import { ANALYTICS_OBJECT_TYPES } from '../src/analytics/events.js'

function build(kinds) {
  const objects = kinds.map((kind, index) => ({ id: index, kind }))
  return buildObjectDeletedMetadata(objects, (object) => object.kind)
}

function sumCounts(metadata) {
  return (
    metadata.path_count
    + metadata.shape_count
    + metadata.text_count
    + metadata.formula_count
    + metadata.group_count
    + metadata.unknown_count
  )
}

test('single path', () => {
  assert.deepEqual(build(['path']), {
    selection_count: 1,
    object_type: ANALYTICS_OBJECT_TYPES.PATH,
    path_count: 1,
    shape_count: 0,
    text_count: 0,
    formula_count: 0,
    group_count: 0,
    unknown_count: 0,
  })
})

test('homogeneous multi path', () => {
  const metadata = build(['path', 'path', 'path'])
  assert.equal(metadata.selection_count, 3)
  assert.equal(metadata.object_type, ANALYTICS_OBJECT_TYPES.PATH)
  assert.equal(metadata.path_count, 3)
  assert.equal(metadata.shape_count, 0)
  assert.equal(metadata.text_count, 0)
  assert.equal(metadata.formula_count, 0)
  assert.equal(metadata.group_count, 0)
  assert.equal(metadata.unknown_count, 0)
})

test('mixed selection', () => {
  const metadata = build(['path', 'path', 'path', 'text', 'formula'])
  assert.equal(metadata.selection_count, 5)
  assert.equal(metadata.object_type, ANALYTICS_OBJECT_TYPES.MIXED)
  assert.equal(metadata.path_count, 3)
  assert.equal(metadata.text_count, 1)
  assert.equal(metadata.formula_count, 1)
  assert.equal(metadata.shape_count, 0)
  assert.equal(metadata.group_count, 0)
  assert.equal(metadata.unknown_count, 0)
  assert.equal(metadata.selection_count, sumCounts(metadata))
})

test('shapes collapse to shape', () => {
  const metadata = build(['shape', 'shape'])
  assert.equal(metadata.object_type, ANALYTICS_OBJECT_TYPES.SHAPE)
  assert.equal(metadata.shape_count, 2)
  assert.equal(metadata.selection_count, 2)
})

test('group is atomic — no child visitation', () => {
  const group = {
    kind: 'group',
    children: [{ kind: 'path' }, { kind: 'formula' }],
  }
  let calls = 0
  const metadata = buildObjectDeletedMetadata([group], (object) => {
    calls += 1
    assert.equal(object, group)
    return object.kind
  })
  assert.equal(calls, 1)
  assert.deepEqual(metadata, {
    selection_count: 1,
    object_type: ANALYTICS_OBJECT_TYPES.GROUP,
    path_count: 0,
    shape_count: 0,
    text_count: 0,
    formula_count: 0,
    group_count: 1,
    unknown_count: 0,
  })
})

test('unknown kind', () => {
  const metadata = build(['unknown'])
  assert.equal(metadata.object_type, ANALYTICS_OBJECT_TYPES.UNKNOWN)
  assert.equal(metadata.unknown_count, 1)
})

test('non-allowlisted classifier value becomes unknown', () => {
  const metadata = build(['activeSelection'])
  assert.equal(metadata.object_type, ANALYTICS_OBJECT_TYPES.UNKNOWN)
  assert.equal(metadata.unknown_count, 1)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'activeSelection_count'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'future_type_count'), false)

  const future = build(['future_type'])
  assert.equal(future.unknown_count, 1)
  assert.equal(Object.prototype.hasOwnProperty.call(future, 'future_type_count'), false)
})

test('mixed with unknown', () => {
  const metadata = build(['path', 'future_type'])
  assert.equal(metadata.object_type, ANALYTICS_OBJECT_TYPES.MIXED)
  assert.equal(metadata.path_count, 1)
  assert.equal(metadata.unknown_count, 1)
  assert.equal(metadata.selection_count, 2)
  assert.equal(metadata.selection_count, sumCounts(metadata))
})
