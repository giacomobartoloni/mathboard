import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateBoardDocument } from '../src/board/persistence/migrateBoardDocument.js'
import {
  BOARD_DOCUMENT_ERROR_CODES,
  BoardDocumentError,
  createEmptyBoardDocument,
} from '../src/board/persistence/schema.js'

test('v1 migration is identity', () => {
  const doc = createEmptyBoardDocument()
  assert.equal(migrateBoardDocument(doc), doc)
})

test('unknown version rejects', () => {
  assert.throws(
    () => migrateBoardDocument({ format: 'mathboard-board', version: 2, title: 't', objects: [] }),
    (error) => error instanceof BoardDocumentError
      && error.code === BOARD_DOCUMENT_ERROR_CODES.UNSUPPORTED_VERSION,
  )
})
