/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
  buildStampShareUrl,
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

test('rejects an invalid wrapped-text width before Stamp materialization', () => {
  const valid = { version: STAMP_VERSION, objects: [{ type: 'text', text: 'Wrapped', width: 120 }] }
  assert.deepEqual(decodeStampString(encodeStampDocument(valid)), valid)
  for (const width of ['garbage', 0, -5]) {
    assert.throws(
      () => validateStampDocument({ version: STAMP_VERSION,
        objects: [{ type: 'text', text: 'Wrapped', width }] }),
      (error) => error instanceof StampError && error.code === STAMP_ERROR_CODES.INVALID_SHAPE,
    )
  }
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

test('buildStampShareUrl puts the payload in the hash', () => {
  assert.equal(
    buildStampShareUrl('abc123', { origin: 'https://mathboard.app', pathname: '/' }),
    'https://mathboard.app/#s=abc123',
  )
})

test('buildStampShareUrl uses the public app for desktop shares', () => {
  const url = buildStampShareUrl(
    'abc123',
    { origin: 'tauri://localhost', pathname: '/internal' },
    { desktop: true },
  )
  assert.equal(url, 'https://mathboard.app/#s=abc123')
  assert.equal(readStampFromLocation(new URL(url)), 'abc123')
})

test('buildStampShareUrl preserves the web development origin', () => {
  assert.equal(
    buildStampShareUrl('abc123', { origin: 'http://localhost:5173', pathname: '/preview' }),
    'http://localhost:5173/preview#s=abc123',
  )
})
