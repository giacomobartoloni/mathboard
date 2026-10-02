import test from 'node:test'
import assert from 'node:assert/strict'
import { Rect, Circle, Line, Path, IText, Group } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import {
  STAMP_VERSION,
  STAMP_ERROR_CODES,
  StampError,
  decodeStampString,
  getKitById,
  materializeStampDocument,
} from '../src/stamps/index.js'

installFabricDomStub()

/** Shared link that previously inflated a pencil stroke as a solid black fill. */
const LEGACY_SHARE_PAYLOAD =
  'eyJ2ZXJzaW9uIjoxLCJvYmplY3RzIjpbeyJ0eXBlIjoicGF0aCIsInBhdGgiOltbIk0iLDMxOCw0MTQuMDAyXSxbIlEiLDMxOCw0MTQsMzE4LDQxMy41XSxbIlEiLDMxOCw0MTMsMzE4LDQxMS41XSxbIlEiLDMxOCw0MTAsMzE4LDM5OC41XSxbIlEiLDMxOCwzODcsMzE4LDM3MV0sWyJRIiwzMTgsMzU1LDMxOC41LDMzOC41XSxbIlEiLDMxOSwzMjIsMzI0LDMwNS41XSxbIlEiLDMyOSwyODksMzM3LDI3Nl0sWyJRIiwzNDUsMjYzLDM1NC41LDI1Mi41XSxbIlEiLDM2NCwyNDIsMzczLDIzNV0sWyJRIiwzODIsMjI4LDM5My41LDIyM10sWyJRIiw0MDUsMjE4LDQxMy41LDIxNl0sWyJRIiw0MjIsMjE0LDQyOSwyMTRdLFsiUSIsNDM2LDIxNCw0NDMsMjE0XSxbIlEiLDQ1MCwyMTQsNDU2LDIxNS41XSxbIlEiLDQ2MiwyMTcsNDY5LDIyMC41XSxbIlEiLDQ3NiwyMjQsNDgxLjUsMjI4LjVdLFsiUSIsNDg3LDIzMyw0OTEsMjM3XSxbIlEiLDQ5NSwyNDEsNDk4LDI0NF0sWyJRIiw1MDEsMjQ3LDUwMi41LDI0OV0sWyJRIiw1MDQsMjUxLDUwNCwyNTJdLFsiTCIsNTA0LDI1My4wMDJdXSwibGVmdCI6LTY4LjUsInRvcCI6LTQ2Ljk5OTAwMDAwMDAwMDAyNCwic2NhbGVYIjoxLCJzY2FsZVkiOjEsInNrZXdYIjowLCJza2V3WSI6MCwiYW5nbGUiOjAsImZsaXBYIjpmYWxzZSwiZmxpcFkiOmZhbHNlLCJvcmlnaW5YIjoiY2VudGVyIiwib3JpZ2luWSI6ImNlbnRlciIsInN0cm9rZSI6IiMwMDAwMDAiLCJzdHJva2VXaWR0aCI6Miwib3BhY2l0eSI6MSwic3Ryb2tlTGluZUNhcCI6InJvdW5kIiwic3Ryb2tlTGluZUpvaW4iOiJyb3VuZCIsIm1hdGhib2FyZElua01vZGUiOiJhdXRvIn0seyJ0eXBlIjoicmVjdCIsIndpZHRoIjoxODIsImhlaWdodCI6NjgsInJ4IjowLCJyeSI6MCwibGVmdCI6LTIxLjUsInRvcCI6NzgsInNjYWxlWCI6MSwic2NhbGVYIjoxLCJza2V3WCI6MCwic2tld1kiOjAsImFuZ2xlIjowLCJmbGlwWCI6ZmFsc2UsImZsaXBZIjpmYWxzZSwib3JpZ2luWCI6ImxlZnQiLCJvcmlnaW5ZIjoidG9wIiwic3Ryb2tlIjoiIzAwMDAwMCIsImZpbGwiOiJ0cmFuc3BhcmVudCIsInN0cm9rZVdpZHRoIjoyLCJvcGFjaXR5IjoxLCJzdHJva2VMaW5lQ2FwIjoiYnV0dCIsInN0cm9rZUxpbmVKb2luIjoibWl0ZXIiLCJtYXRoYm9hcmRJbmtNb2RlIjoiYXV0byJ9XX0'

const noopFormula = async () => ({ type: 'image' })

async function inflate(doc, buildFormula = noopFormula) {
  return materializeStampDocument(doc, { buildFormula })
}

test('inflate requires a formula builder', async () => {
  await assert.rejects(
    () => materializeStampDocument({ version: STAMP_VERSION, objects: [{ type: 'rect' }] }),
    (error) => error instanceof StampError && error.code === STAMP_ERROR_CODES.MATERIALIZE_FAILED,
  )
})

test('inflate builds Fabric primitives for each stamp node type', async () => {
  const [rect, circle, line, path, text] = await inflate({
    version: STAMP_VERSION,
    objects: [
      {
        type: 'rect',
        left: 1,
        top: 2,
        width: 30,
        height: 40,
        fill: 'transparent',
        stroke: '#111111',
        strokeWidth: 2,
        mathboardInkMode: 'auto',
      },
      {
        type: 'circle',
        left: 10,
        top: 20,
        radius: 8,
        fill: 'transparent',
        stroke: '#222222',
      },
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 5,
        y2: 5,
        stroke: '#333333',
        strokeWidth: 1,
      },
      {
        type: 'path',
        path: [['M', 0, 0], ['L', 4, 4]],
        fill: null,
        stroke: '#444444',
        strokeWidth: 3,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      },
      {
        type: 'text',
        text: 'hello',
        left: 3,
        top: 4,
        fontSize: 18,
        fill: '#555555',
        mathboardInkMode: 'fixed',
      },
    ],
  })

  assert.ok(rect instanceof Rect)
  assert.equal(rect.width, 30)
  assert.equal(rect.height, 40)
  assert.equal(rect.fill, 'transparent')
  assert.equal(rect.stroke, '#111111')
  assert.equal(rect.mathboardInkMode, 'auto')

  assert.ok(circle instanceof Circle)
  assert.equal(circle.radius, 8)
  assert.equal(circle.fill, 'transparent')

  assert.ok(line instanceof Line)
  assert.equal(line.x1, 0)
  assert.equal(line.y2, 5)
  assert.equal(line.stroke, '#333333')

  assert.ok(path instanceof Path)
  assert.equal(path.fill, null)
  assert.equal(path.stroke, '#444444')
  assert.equal(path.strokeLineCap, 'round')

  assert.ok(text instanceof IText)
  assert.equal(text.text, 'hello')
  assert.equal(text.fontSize, 18)
  assert.equal(text.fill, '#555555')
  assert.equal(text.mathboardInkMode, 'fixed')
})

test('inflate nests group children as a Fabric Group', async () => {
  const [group] = await inflate({
    version: STAMP_VERSION,
    objects: [
      {
        type: 'group',
        left: 50,
        top: 60,
        objects: [
          { type: 'circle', radius: 5, fill: 'transparent', stroke: '#000' },
          { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, stroke: '#000' },
        ],
      },
    ],
  })

  assert.ok(group instanceof Group)
  assert.equal(group.left, 50)
  assert.equal(group.top, 60)
  const children = group.getObjects()
  assert.equal(children.length, 2)
  assert.ok(children[0] instanceof Circle)
  assert.ok(children[1] instanceof Line)
})

test('inflate calls buildFormula for formula nodes and keeps ink metadata', async () => {
  const calls = []
  const fakeImage = { type: 'image', latex: 'x^2' }
  const [img] = await inflate(
    {
      version: STAMP_VERSION,
      objects: [
        {
          type: 'formula',
          latex: 'x^2',
          left: 12,
          top: 34,
          mathboardInkMode: 'auto',
          mathboardRenderedInkIsLight: true,
        },
      ],
    },
    async (spec) => {
      calls.push(spec)
      return fakeImage
    },
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].latex, 'x^2')
  assert.equal(calls[0].left, 12)
  assert.equal(calls[0].top, 34)
  assert.equal(img, fakeImage)
  assert.equal(img.mathboardInkMode, 'auto')
  assert.equal(img.mathboardRenderedInkIsLight, true)
})

test('inflate fails when formula builder returns null', async () => {
  await assert.rejects(
    () => inflate(
      {
        version: STAMP_VERSION,
        objects: [{ type: 'formula', latex: 'a+b' }],
      },
      async () => null,
    ),
    (error) => error instanceof StampError && error.code === STAMP_ERROR_CODES.FORMULA_RENDER_FAILED,
  )
})

test('inflate rejects unknown node types', async () => {
  await assert.rejects(
    () => inflate({
      version: STAMP_VERSION,
      objects: [{ type: 'triangle' }],
    }),
    (error) => error instanceof StampError && error.code === STAMP_ERROR_CODES.UNKNOWN_TYPE,
  )
})

test('inflate keeps explicit null fill on paths', async () => {
  const [path] = await inflate({
    version: STAMP_VERSION,
    objects: [
      {
        type: 'path',
        path: [['M', 0, 0], ['Q', 10, 20, 30, 0]],
        fill: null,
        stroke: '#000000',
        strokeWidth: 2,
      },
    ],
  })
  assert.equal(path.fill, null)
  assert.notEqual(path.fill, 'rgb(0,0,0)')
})

test('inflate treats legacy paths without fill as stroke-only', async () => {
  const [path] = await inflate({
    version: STAMP_VERSION,
    objects: [
      {
        type: 'path',
        path: [['M', 0, 0], ['L', 10, 10]],
        stroke: '#111111',
        strokeWidth: 3,
      },
    ],
  })
  assert.equal(path.fill, null)
})

test('inflate recovers the reported share link without filling the stroke', async () => {
  const doc = decodeStampString(LEGACY_SHARE_PAYLOAD)
  assert.equal(doc.objects.length, 2)
  assert.equal(doc.objects[0].type, 'path')
  assert.equal(doc.objects[0].fill, undefined)
  assert.equal(doc.objects[1].type, 'rect')
  assert.equal(doc.objects[1].fill, 'transparent')

  const [path, rect] = await inflate(doc)
  assert.ok(path instanceof Path)
  assert.equal(path.fill, null)
  assert.equal(path.stroke, '#000000')
  assert.equal(path.strokeWidth, 2)
  assert.equal(path.mathboardInkMode, 'auto')

  assert.ok(rect instanceof Rect)
  assert.equal(rect.fill, 'transparent')
  assert.equal(rect.width, 182)
  assert.equal(rect.height, 68)
  assert.equal(rect.mathboardInkMode, 'auto')
})

test('inflate materializes built-in kits to Fabric objects', async () => {
  for (const id of ['cartesianPlane', 'unitCircle']) {
    const objects = await inflate(decodeStampString(getKitById(id)))
    assert.ok(objects.length >= 1)
    for (const object of objects) {
      assert.ok(
        object instanceof Group
          || object instanceof Line
          || object instanceof Circle
          || object instanceof Path
          || object instanceof Rect
          || object instanceof IText,
        `unexpected kit object type for ${id}: ${object?.type}`,
      )
    }
  }
})

test('inflate does not force null over an explicit path fill', async () => {
  const [path] = await inflate({
    version: STAMP_VERSION,
    objects: [
      {
        type: 'path',
        path: [['M', 0, 0], ['L', 8, 0], ['L', 4, 8], ['Z']],
        fill: '#ff0000',
        stroke: '#000000',
        strokeWidth: 1,
      },
    ],
  })
  assert.equal(path.fill, '#ff0000')
})

test('inflate applies strokeDashArray, origins, and flips', async () => {
  const [line] = await inflate({
    version: STAMP_VERSION,
    objects: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 10,
        y2: 0,
        stroke: '#000',
        strokeDashArray: [2, 4],
        originX: 'center',
        originY: 'center',
        flipX: true,
        angle: 45,
        opacity: 0.5,
      },
    ],
  })
  assert.deepEqual(line.strokeDashArray, [2, 4])
  assert.equal(line.originX, 'center')
  assert.equal(line.flipX, true)
  assert.equal(line.angle, 45)
  assert.equal(line.opacity, 0.5)
})

test('inflate text with sparse props does not crash on missing fontStyle', async () => {
  const [text] = await inflate({
    version: STAMP_VERSION,
    objects: [{ type: 'text', text: 'sparse' }],
  })
  assert.ok(text instanceof IText)
  assert.equal(text.text, 'sparse')
})

test('inflate wraps unexpected builder errors as MATERIALIZE_FAILED', async () => {
  await assert.rejects(
    () => inflate(
      {
        version: STAMP_VERSION,
        objects: [{ type: 'formula', latex: 'x' }],
      },
      async () => {
        throw new Error('renderer exploded')
      },
    ),
    (error) => (
      error instanceof StampError
      && error.code === STAMP_ERROR_CODES.MATERIALIZE_FAILED
      && /renderer exploded/.test(error.message)
    ),
  )
})

test('inflate empty group yields a Fabric Group with no children', async () => {
  const [group] = await inflate({
    version: STAMP_VERSION,
    objects: [{ type: 'group', objects: [] }],
  })
  assert.ok(group instanceof Group)
  assert.equal(group.getObjects().length, 0)
})

test('inflate deep nesting stays within supported depth', async () => {
  let node = { type: 'circle', radius: 1, fill: 'transparent', stroke: '#000' }
  for (let i = 0; i < 8; i += 1) {
    node = { type: 'group', objects: [node] }
  }
  const [root] = await inflate({ version: STAMP_VERSION, objects: [node] })
  assert.ok(root instanceof Group)
  let current = root
  for (let i = 0; i < 8; i += 1) {
    assert.ok(current instanceof Group)
    current = current.getObjects()[0]
  }
  assert.ok(current instanceof Circle)
})
