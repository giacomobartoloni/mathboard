import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BOARD_DOCUMENT_FORMAT,
  BOARD_DOCUMENT_VERSION,
  BOARD_DOCUMENT_ERROR_CODES,
  BoardDocumentError,
  createEmptyBoardDocument,
  validateBoardDocument,
} from '../src/board/persistence/schema.js'

test('empty board is valid', () => {
  const doc = createEmptyBoardDocument()
  assert.equal(doc.format, BOARD_DOCUMENT_FORMAT)
  assert.equal(doc.version, BOARD_DOCUMENT_VERSION)
  assert.deepEqual(validateBoardDocument(doc).objects, [])
})

test('duplicate ids rejected across nesting', () => {
  assert.throws(
    () => validateBoardDocument({
      format: BOARD_DOCUMENT_FORMAT,
      version: BOARD_DOCUMENT_VERSION,
      title: 't',
      objects: [
        {
          id: 'mbobj_same',
          type: 'group',
          objects: [{ id: 'mbobj_same', type: 'rect', width: 1, height: 1 }],
        },
      ],
    }),
    (error) => error instanceof BoardDocumentError
      && error.code === BOARD_DOCUMENT_ERROR_CODES.DUPLICATE_ID,
  )
})

test('unsupported version rejected', () => {
  assert.throws(
    () => validateBoardDocument({
      format: BOARD_DOCUMENT_FORMAT,
      version: 99,
      title: 't',
      objects: [],
    }),
    (error) => error instanceof BoardDocumentError
      && error.code === BOARD_DOCUMENT_ERROR_CODES.UNSUPPORTED_VERSION,
  )
})

test('unknown type rejected', () => {
  assert.throws(
    () => validateBoardDocument({
      format: BOARD_DOCUMENT_FORMAT,
      version: BOARD_DOCUMENT_VERSION,
      title: 't',
      objects: [{ id: 'mbobj_1', type: 'widget' }],
    }),
    (error) => error instanceof BoardDocumentError
      && error.code === BOARD_DOCUMENT_ERROR_CODES.UNKNOWN_TYPE,
  )
})
