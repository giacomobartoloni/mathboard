/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { copyBoardDocumentWithFreshIds } from '../src/share/copyBoardDocument.js'
import { createEmptyBoardDocument, validateBoardDocument } from '../src/board/persistence/schema.js'

if (!globalThis.crypto) globalThis.crypto = webcrypto
test('shared board copy preserves independent top-level objects and group structure with fresh IDs', () => {
  const original = createEmptyBoardDocument('Lesson')
  original.objects = [
    { id: 'a', type: 'rect', left: 3, top: 5, width: 10, height: 10 },
    { id: 'b', type: 'group', left: 0, top: 0, objects: [
      { id: 'c', type: 'rect', left: 2, top: 4, width: 3, height: 3 },
    ] },
  ]
  validateBoardDocument(original)
  const copy = copyBoardDocumentWithFreshIds(original)
  assert.equal(copy.objects.length, 2)
  assert.equal(copy.objects[1].type, 'group')
  assert.equal(copy.objects[1].objects[0].left, 2)
  assert.equal(copy.objects[0].id !== 'a', true)
  assert.equal(copy.objects[1].id !== 'b', true)
  assert.equal(copy.objects[1].objects[0].id !== 'c', true)
  assert.equal(original.objects[0].id, 'a')
})
