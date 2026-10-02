import test from 'node:test'
import assert from 'node:assert/strict'
import { fabricLike } from './helpers/fabric-like.js'
import {
  STAMP_VERSION,
  STAMP_MAX_BYTES,
  STAMP_ERROR_CODES,
  StampError,
  encodeStampDocument,
  decodeStampString,
  toBase64Url,
  serializeFabricObject,
  stampDocumentFromObjects,
  encodeObjectsAsStamp,
} from '../src/stamps/index.js'

function assertStampError(fn, code) {
  assert.throws(fn, (error) => error instanceof StampError && error.code === code)
}

test('deflate rejects missing objects and empty selections', () => {
  assertStampError(() => serializeFabricObject(null), STAMP_ERROR_CODES.INVALID_SHAPE)
  assertStampError(() => serializeFabricObject(undefined), STAMP_ERROR_CODES.INVALID_SHAPE)
  assertStampError(() => stampDocumentFromObjects([]), STAMP_ERROR_CODES.INVALID_SHAPE)
  assertStampError(() => stampDocumentFromObjects(null), STAMP_ERROR_CODES.INVALID_SHAPE)
  assertStampError(() => encodeObjectsAsStamp([]), STAMP_ERROR_CODES.INVALID_SHAPE)
})

test('deflate refuses ActiveSelection (callers must export members)', () => {
  assertStampError(
    () => serializeFabricObject(fabricLike('ActiveSelection', { getObjects: () => [] })),
    STAMP_ERROR_CODES.INVALID_SHAPE,
  )
})

test('deflate rejects unknown fabric types', () => {
  assertStampError(
    () => serializeFabricObject(fabricLike('triangle', { width: 10 })),
    STAMP_ERROR_CODES.UNKNOWN_TYPE,
  )
})

test('deflate serializes each supported primitive', () => {
  const rect = serializeFabricObject(fabricLike('rect', {
    width: 40,
    height: 20,
    rx: 2,
    ry: 3,
    left: 1,
    top: 2,
    fill: 'transparent',
    stroke: '#000000',
    strokeWidth: 2,
    mathboardInkMode: 'auto',
  }))
  assert.equal(rect.type, 'rect')
  assert.equal(rect.width, 40)
  assert.equal(rect.height, 20)
  assert.equal(rect.rx, 2)
  assert.equal(rect.fill, 'transparent')
  assert.equal(rect.mathboardInkMode, 'auto')

  const circle = serializeFabricObject(fabricLike('circle', {
    radius: 9,
    fill: 'transparent',
    stroke: '#111',
  }))
  assert.equal(circle.type, 'circle')
  assert.equal(circle.radius, 9)

  const line = serializeFabricObject(fabricLike('line', {
    x1: 0, y1: 1, x2: 2, y2: 3, stroke: '#222',
  }))
  assert.deepEqual(
    { type: line.type, x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 },
    { type: 'line', x1: 0, y1: 1, x2: 2, y2: 3 },
  )

  const path = serializeFabricObject(fabricLike('path', {
    path: [['M', 0, 0], ['L', 1, 1]],
    fill: null,
    stroke: '#333',
    strokeLineCap: 'round',
  }))
  assert.equal(path.type, 'path')
  assert.equal(path.fill, null)
  assert.equal(path.strokeLineCap, 'round')

  const text = serializeFabricObject(fabricLike('i-text', {
    text: 'π',
    fontSize: 22,
    fontFamily: 'Arial',
    fill: '#444',
    underline: true,
  }))
  assert.equal(text.type, 'text')
  assert.equal(text.text, 'π')
  assert.equal(text.fontSize, 22)
  assert.equal(text.underline, true)
})

test('deflate preserves null fill and omits undefined styles', () => {
  const withNull = serializeFabricObject(fabricLike('path', {
    path: [['M', 0, 0], ['L', 2, 2]],
    fill: null,
    stroke: '#000',
  }))
  assert.equal(withNull.fill, null)
  assert.equal(Object.hasOwn(withNull, 'fill'), true)
  assert.equal(Object.hasOwn(withNull, 'opacity'), false)

  const withoutFill = serializeFabricObject(fabricLike('path', {
    path: [['M', 0, 0], ['L', 2, 2]],
    stroke: '#000',
  }))
  assert.equal(Object.hasOwn(withoutFill, 'fill'), false)
})

test('deflate preserves zero opacity and false flips (falsy but meaningful)', () => {
  const node = serializeFabricObject(fabricLike('rect', {
    width: 1,
    height: 1,
    opacity: 0,
    flipX: false,
    flipY: true,
    scaleX: 0,
    fill: 'transparent',
  }))
  assert.equal(node.opacity, 0)
  assert.equal(node.flipX, false)
  assert.equal(node.flipY, true)
  assert.equal(node.scaleX, 0)
})

test('deflate copies strokeDashArray instead of sharing the reference', () => {
  const dash = [4, 2]
  const node = serializeFabricObject(fabricLike('line', {
    x1: 0, y1: 0, x2: 1, y2: 1, stroke: '#000', strokeDashArray: dash,
  }))
  assert.deepEqual(node.strokeDashArray, [4, 2])
  assert.notEqual(node.strokeDashArray, dash)
  dash.push(9)
  assert.deepEqual(node.strokeDashArray, [4, 2])
})

test('deflate walks permanent groups recursively', () => {
  const child = fabricLike('circle', { radius: 3, fill: 'transparent', stroke: '#000' })
  const group = serializeFabricObject(fabricLike('group', {
    left: 10,
    top: 20,
    getObjects: () => [child],
  }))
  assert.equal(group.type, 'group')
  assert.equal(group.objects.length, 1)
  assert.equal(group.objects[0].type, 'circle')
  assert.equal(group.objects[0].radius, 3)
})

test('deflate recognizes formulas via formulaType, objectKind, or latex', () => {
  assert.equal(
    serializeFabricObject(fabricLike('image', {
      formulaType: 'katex-formula',
      latex: 'a+b',
      left: 1,
    })).type,
    'formula',
  )
  assert.equal(
    serializeFabricObject(fabricLike('image', {
      objectKind: 'formula',
      latex: 'c',
    })).latex,
    'c',
  )
  assert.equal(
    serializeFabricObject(fabricLike('image', { latex: 'd' })).latex,
    'd',
  )
})

test('deflate rejects formulas without usable latex', () => {
  assertStampError(
    () => serializeFabricObject(fabricLike('image', {
      formulaType: 'katex-formula',
      latex: '   ',
    })),
    STAMP_ERROR_CODES.INVALID_SHAPE,
  )
  assertStampError(
    () => serializeFabricObject(fabricLike('image', {
      formulaType: 'katex-formula',
    })),
    STAMP_ERROR_CODES.INVALID_SHAPE,
  )
})

test('deflate encodeObjectsAsStamp produces a decodable base64url payload', () => {
  const encoded = encodeObjectsAsStamp([
    fabricLike('rect', {
      width: 10,
      height: 12,
      fill: 'transparent',
      stroke: '#abcabc',
      strokeWidth: 1,
    }),
  ])
  assert.equal(typeof encoded, 'string')
  assert.ok(!encoded.includes('+'))
  assert.ok(!encoded.includes('/'))
  assert.ok(!encoded.includes('='))
  const doc = decodeStampString(encoded)
  assert.equal(doc.version, STAMP_VERSION)
  assert.equal(doc.objects[0].type, 'rect')
  assert.equal(doc.objects[0].width, 10)
  assert.equal(doc.objects[0].fill, 'transparent')
})

test('deflate encode rejects oversized documents', () => {
  const huge = 'x'.repeat(STAMP_MAX_BYTES)
  assertStampError(
    () => encodeStampDocument({
      version: STAMP_VERSION,
      objects: [{ type: 'text', text: huge }],
    }),
    STAMP_ERROR_CODES.TOO_LARGE,
  )
})

test('deflate codec rejects empty, corrupt, and non-json payloads', () => {
  assertStampError(() => decodeStampString(''), STAMP_ERROR_CODES.EMPTY)
  assertStampError(() => decodeStampString('   '), STAMP_ERROR_CODES.EMPTY)
  assertStampError(() => decodeStampString('!!!'), STAMP_ERROR_CODES.INVALID_ENCODING)
  const notJson = toBase64Url(new TextEncoder().encode('not-json'))
  assertStampError(() => decodeStampString(notJson), STAMP_ERROR_CODES.INVALID_JSON)
})

test('deflate codec rejects invalid stamp shapes after decode', () => {
  const encodeRaw = (value) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)))

  assertStampError(
    () => decodeStampString(encodeRaw({ version: 99, objects: [{ type: 'rect' }] })),
    STAMP_ERROR_CODES.UNSUPPORTED_VERSION,
  )
  assertStampError(
    () => decodeStampString(encodeRaw({ version: STAMP_VERSION, objects: [] })),
    STAMP_ERROR_CODES.INVALID_SHAPE,
  )
  assertStampError(
    () => decodeStampString(encodeRaw({ version: STAMP_VERSION, objects: [{ type: 'line' }] })),
    STAMP_ERROR_CODES.INVALID_SHAPE,
  )
  assertStampError(
    () => decodeStampString(encodeRaw({
      version: STAMP_VERSION,
      objects: [{ type: 'path', path: 'M0 0' }],
    })),
    STAMP_ERROR_CODES.INVALID_SHAPE,
  )
  assertStampError(
    () => decodeStampString(encodeRaw({
      version: STAMP_VERSION,
      objects: [{ type: 'hexagon' }],
    })),
    STAMP_ERROR_CODES.UNKNOWN_TYPE,
  )
})

test('deflate stampDocumentFromObjects sets version and maps all members', () => {
  const doc = stampDocumentFromObjects([
    fabricLike('rect', { width: 1, height: 2, fill: 'transparent' }),
    fabricLike('circle', { radius: 4, fill: 'transparent' }),
  ])
  assert.equal(doc.version, STAMP_VERSION)
  assert.equal(doc.objects.length, 2)
  assert.equal(doc.objects[0].type, 'rect')
  assert.equal(doc.objects[1].type, 'circle')
})
