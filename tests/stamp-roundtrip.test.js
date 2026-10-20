import test from 'node:test'
import assert from 'node:assert/strict'
import { Rect, Circle, Line, Path, IText, Group } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import {
  STAMP_VERSION,
  STAMP_ERROR_CODES,
  StampError,
  encodeObjectsAsStamp,
  decodeStampString,
  materializeStampDocument,
  serializeFabricObject,
  getKitById,
} from '../src/stamps/index.js'

installFabricDomStub()

const noopFormula = async () => ({ type: 'image' })

async function roundTrip(fabricObjects, buildFormula = noopFormula) {
  const encoded = encodeObjectsAsStamp(fabricObjects)
  const doc = decodeStampString(encoded)
  return materializeStampDocument(doc, { buildFormula })
}

test('round-trip keeps pencil paths stroke-only (null fill)', async () => {
  const path = new Path([['M', 0, 0], ['Q', 20, 40, 60, 0]], {
    fill: null,
    stroke: '#000000',
    strokeWidth: 2,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    left: -10,
    top: -5,
    originX: 'center',
    originY: 'center',
    mathboardInkMode: 'auto',
  })
  path.mathboardInkMode = 'auto'

  const deflated = serializeFabricObject(path)
  assert.equal(deflated.fill, null)

  const [inflated] = await roundTrip([path])
  assert.ok(inflated instanceof Path)
  assert.equal(inflated.fill, null)
  assert.equal(inflated.stroke, '#000000')
  assert.equal(inflated.strokeWidth, 2)
  assert.equal(inflated.strokeLineCap, 'round')
  assert.equal(inflated.mathboardInkMode, 'auto')
})

test('round-trip keeps transparent shape fills', async () => {
  const rect = new Rect({
    width: 80,
    height: 40,
    fill: 'transparent',
    stroke: '#112233',
    strokeWidth: 2,
    left: 3,
    top: 4,
  })
  rect.mathboardInkMode = 'auto'

  const [inflated] = await roundTrip([rect])
  assert.ok(inflated instanceof Rect)
  assert.equal(inflated.fill, 'transparent')
  assert.equal(inflated.stroke, '#112233')
  assert.equal(inflated.width, 80)
  assert.equal(inflated.height, 40)
  assert.equal(inflated.mathboardInkMode, 'auto')
})

test('round-trip preserves mixed selection of path + rect', async () => {
  const path = new Path([['M', 0, 0], ['L', 10, 10]], {
    fill: null,
    stroke: '#000000',
    strokeWidth: 2,
  })
  const rect = new Rect({
    width: 20,
    height: 10,
    fill: 'transparent',
    stroke: '#000000',
    strokeWidth: 2,
  })
  path.mathboardInkMode = 'auto'
  rect.mathboardInkMode = 'auto'

  const [outPath, outRect] = await roundTrip([path, rect])
  assert.equal(outPath.fill, null)
  assert.equal(outRect.fill, 'transparent')
})

test('round-trip preserves text content and styles', async () => {
  const text = new IText('hello', {
    fontSize: 20,
    fontFamily: 'Arial',
    fill: '#334455',
    left: 8,
    top: 9,
    underline: true,
  })
  text.mathboardInkMode = 'fixed'

  const [inflated] = await roundTrip([text])
  assert.ok(inflated instanceof IText)
  assert.equal(inflated.text, 'hello')
  assert.equal(inflated.fontSize, 20)
  assert.equal(inflated.fill, '#334455')
  assert.equal(inflated.underline, true)
  assert.equal(inflated.mathboardInkMode, 'fixed')
})

test('round-trip preserves permanent groups and children', async () => {
  const group = new Group(
    [
      new Circle({ radius: 6, fill: 'transparent', stroke: '#000' }),
      new Line([0, 0, 12, 0], { stroke: '#000', strokeWidth: 1 }),
    ],
    { left: 15, top: 25, subTargetCheck: false, interactive: false },
  )

  const [inflated] = await roundTrip([group])
  assert.ok(inflated instanceof Group)
  const children = inflated.getObjects()
  assert.equal(children.length, 2)
  assert.ok(children[0] instanceof Circle)
  assert.ok(children[1] instanceof Line)
})

test('round-trip encodes formulas as latex and reinflates via buildFormula', async () => {
  const formulaLike = {
    type: 'image',
    formulaType: 'katex-formula',
    latex: '\\frac{a}{b}',
    left: 11,
    top: 22,
    isType() {
      return false
    },
  }
  formulaLike.mathboardInkMode = 'auto'
  formulaLike.mathboardRenderedInkIsLight = false

  const encoded = encodeObjectsAsStamp([formulaLike])
  const doc = decodeStampString(encoded)
  assert.equal(doc.objects[0].type, 'formula')
  assert.equal(doc.objects[0].latex, '\\frac{a}{b}')

  const fake = { type: 'image' }
  const [img] = await materializeStampDocument(doc, {
    buildFormula: async (spec) => {
      assert.equal(spec.latex, '\\frac{a}{b}')
      assert.equal(spec.left, 11)
      return fake
    },
  })
  assert.equal(img, fake)
  assert.equal(img.mathboardInkMode, 'auto')
})

test('round-trip kits survive encode → decode → inflate', async () => {
  for (const id of ['cartesianPlane', 'unitCircle']) {
    const encoded = getKitById(id)
    const objects = await materializeStampDocument(decodeStampString(encoded), {
      buildFormula: noopFormula,
    })
    assert.ok(objects.length >= 1)
    assert.ok(objects[0] instanceof Group || objects.length > 0)
  }
})

test('round-trip preserves dash arrays and zero opacity', async () => {
  const line = new Line([0, 0, 30, 0], {
    stroke: '#000',
    strokeWidth: 2,
    strokeDashArray: [6, 3],
    opacity: 0,
  })
  const [inflated] = await roundTrip([line])
  assert.ok(inflated instanceof Line)
  assert.deepEqual(inflated.strokeDashArray, [6, 3])
  assert.equal(inflated.opacity, 0)
})
