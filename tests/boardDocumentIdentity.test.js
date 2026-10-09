import test from 'node:test'
import assert from 'node:assert/strict'
import { cloneBoardDocumentWithFreshIds } from '../src/board/persistence/cloneBoardDocument.js'
import { createEmptyBoardDocument } from '../src/board/persistence/schema.js'

test('cloneBoardDocumentWithFreshIds remaps nested ids', () => {
  const doc = {
    ...createEmptyBoardDocument('Copy'),
    objects: [{
      id: 'mbobj_g',
      type: 'group',
      objects: [
        { id: 'mbobj_a', type: 'rect', width: 1, height: 1 },
        { id: 'mbobj_b', type: 'text', text: 'x' },
      ],
    }],
  }
  const { document: cloned, idMap } = cloneBoardDocumentWithFreshIds(doc)
  assert.notEqual(cloned.objects[0].id, 'mbobj_g')
  assert.notEqual(cloned.objects[0].objects[0].id, 'mbobj_a')
  assert.equal(idMap.get('mbobj_g'), cloned.objects[0].id)
  assert.equal(idMap.get('mbobj_a'), cloned.objects[0].objects[0].id)
})
