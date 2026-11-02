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

test('document paths reject non-numeric coordinates and invalid SVG commands', () => {
  const malformed = [
    { path: [['M', 64, '532']], field: 'objects[0].path[0][2]' },
    { path: [['M', 0, 0], ['C', 1, 2]], field: 'objects[0].path[1]' },
    { path: [['M', 0, 0], ['A', 10, 10, 0, 0, 2, 10, 10]], field: 'objects[0].path[1][5]' },
  ]
  for (const { path, field } of malformed) {
    assert.throws(
      () => validateBoardDocument({
        ...createEmptyBoardDocument(),
        objects: [{ id: 'mbobj_path', type: 'path', path }],
      }),
      (error) => error instanceof BoardDocumentError
        && error.code === BOARD_DOCUMENT_ERROR_CODES.INVALID
        && error.message.includes(field),
    )
  }
  const valid = {
    ...createEmptyBoardDocument(),
    objects: [{ id: 'mbobj_path', type: 'path',
      path: [['M', 0, 0], ['A', 10, 10, 0, 0, 1, 20, 20], ['Z']] }],
  }
  assert.equal(validateBoardDocument(valid), valid)
})

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
