import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STAMP_VERSION,
  STAMP_ERROR_CODES,
  StampError,
  encodeStampDocument,
  decodeStampString,
  validateStampDocument,
  getKitById,
  readStampFromLocation,
} from '../src/stamps/index.js'

test('round-trips a minimal stamp document', () => {
  const doc = {
    version: STAMP_VERSION,
    objects: [
      {
        type: 'rect',
        left: 10,
        top: 20,
        width: 30,
        height: 40,
        stroke: '#000000',
        fill: 'transparent',
        strokeWidth: 2,
      },
    ],
  }
  const encoded = encodeStampDocument(doc)
  assert.equal(typeof encoded, 'string')
  assert.ok(!encoded.includes('+'))
  assert.ok(!encoded.includes('/'))
  assert.deepEqual(decodeStampString(encoded), doc)
})

test('rejects unsupported versions and empty payloads', () => {
  assert.throws(
    () => validateStampDocument({ version: 99, objects: [{ type: 'rect' }] }),
    (error) => error instanceof StampError && error.code === STAMP_ERROR_CODES.UNSUPPORTED_VERSION,
  )
  assert.throws(
    () => decodeStampString(''),
    (error) => error instanceof StampError && error.code === STAMP_ERROR_CODES.EMPTY,
  )
  assert.throws(
    () => decodeStampString('!!!not-base64!!!'),
    (error) => error instanceof StampError && error.code === STAMP_ERROR_CODES.INVALID_ENCODING,
  )
})

test('accepts nested groups', () => {
  const doc = {
    version: STAMP_VERSION,
    objects: [
      {
        type: 'group',
        objects: [
          { type: 'circle', radius: 5, left: 0, top: 0 },
          {
            type: 'group',
            objects: [{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, stroke: '#111' }],
          },
        ],
      },
    ],
  }
  assert.deepEqual(decodeStampString(encodeStampDocument(doc)), doc)
})

test('built-in kits encode to valid stamps', () => {
  for (const id of ['cartesianPlane', 'unitCircle']) {
    const encoded = getKitById(id)
    const doc = decodeStampString(encoded)
    assert.equal(doc.version, STAMP_VERSION)
    assert.ok(doc.objects.length >= 1)
  }
})

test('readStampFromLocation prefers hash over query', () => {
  assert.equal(
    readStampFromLocation({ hash: '#s=abc', search: '?s=query' }),
    'abc',
  )
  assert.equal(
    readStampFromLocation({ hash: '', search: '?s=fromQuery' }),
    'fromQuery',
  )
  assert.equal(readStampFromLocation({ hash: '', search: '' }), null)
})
