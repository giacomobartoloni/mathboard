import test from 'node:test'
import assert from 'node:assert/strict'
import { Rect, Circle, Line, Path, IText, Group } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { ensureMathBoardObjectId } from '../src/board/ids.js'
import { serializeBoardDocument } from '../src/board/persistence/serializeBoardDocument.js'
import { materializeBoardDocument } from '../src/board/persistence/materializeBoardDocument.js'
import { replaceBoardFromDocument } from '../src/board/persistence/replaceBoardFromDocument.js'
import {
  BOARD_DOCUMENT_ERROR_CODES,
  BoardDocumentError,
} from '../src/board/persistence/schema.js'

installFabricDomStub()

const policy = new BoardObjectPolicy()

/** Minimal canvas stand-in — avoids Fabric Canvas DOM requirements in node:test. */
function makeCanvas(objects = []) {
  const list = objects.slice()
  return {
    getObjects: () => list.slice(),
    add: (object) => {
      list.push(object)
    },
    remove: (object) => {
      const index = list.indexOf(object)
      if (index >= 0) list.splice(index, 1)
    },
    discardActiveObject: () => {},
    requestRenderAll: () => {},
  }
}

test('round-trip preserves semantics, ids, and z-order', async () => {
  const back = new Rect({ width: 40, height: 20, left: 0, top: 0, fill: '#ff0000' })
  const front = new Circle({ radius: 10, left: 50, top: 50, fill: null, stroke: '#00ff00' })
  const path = new Path([['M', 0, 0], ['L', 8, 8]], {
    fill: null,
    stroke: '#000000',
    strokeWidth: 2,
    left: 100,
    top: 100,
  })
  const text = new IText('hi', { left: 120, top: 10, fontSize: 18 })
  const line = new Line([0, 0, 30, 0], { left: 10, top: 80, stroke: '#0000ff' })
  ;[back, front, path, text, line].forEach((object) => ensureMathBoardObjectId(object))

  const canvasA = makeCanvas([back, front, path, text, line])
  const docA = serializeBoardDocument({
    canvas: canvasA,
    boardObjectPolicy: policy,
    title: 'Roundtrip',
  })

  assert.equal(docA.objects.map((n) => n.type).join(','), 'rect,circle,path,text,line')
  assert.equal(docA.objects[2].fill, null)

  const idsA = docA.objects.map((n) => n.id)
  const { objects } = await materializeBoardDocument(docA, {
    buildFormula: async () => {
      throw new Error('no formulas in this test')
    },
  })

  const canvasB = makeCanvas(objects)
  const docB = serializeBoardDocument({
    canvas: canvasB,
    boardObjectPolicy: policy,
    title: 'Roundtrip',
  })

  assert.deepEqual(docB.objects.map((n) => n.id), idsA)
  assert.equal(docB.objects[0].type, 'rect')
  assert.equal(docB.objects[1].type, 'circle')
  assert.equal(docB.objects[2].fill, null)
  assert.equal(docB.objects[3].text, 'hi')
})

test('nested group preserves child ids', async () => {
  const child = new Rect({ width: 5, height: 5, left: 0, top: 0 })
  ensureMathBoardObjectId(child, 'mbobj_child')
  const group = new Group([child], { left: 20, top: 30, subTargetCheck: false, interactive: false })
  ensureMathBoardObjectId(group, 'mbobj_group')
  const canvas = makeCanvas([group])
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy, title: 'g' })
  assert.equal(doc.objects[0].id, 'mbobj_group')
  assert.equal(doc.objects[0].objects[0].id, 'mbobj_child')
})

test('BoardDocument excludes renderer-only formula polarity', () => {
  const rect = new Rect({ width: 10, height: 10 })
  rect.mathboardRenderedInkIsLight = true
  ensureMathBoardObjectId(rect, 'mbobj_rect')

  const document = serializeBoardDocument({
    canvas: makeCanvas([rect]),
    boardObjectPolicy: policy,
    title: 'No renderer state',
  })

  assert.equal('mathboardRenderedInkIsLight' in document.objects[0], false)
})

test('atomic replace leaves current board on materialize failure', async () => {
  const keep = new Rect({ width: 9, height: 9, left: 1, top: 1 })
  ensureMathBoardObjectId(keep, 'mbobj_keep')
  const canvas = makeCanvas([keep])
  let historyReset = false

  await assert.rejects(
    () => replaceBoardFromDocument({
      canvas,
      document: {
        format: 'mathboard-board',
        version: 1,
        title: 'bad',
        objects: [{ id: 'mbobj_f', type: 'formula', latex: 'a+b' }],
      },
      buildFormula: async () => null,
      resetHistory: () => {
        historyReset = true
      },
    }),
    (error) => error instanceof BoardDocumentError
      && error.code === BOARD_DOCUMENT_ERROR_CODES.FORMULA_RENDER_FAILED,
  )

  assert.equal(canvas.getObjects().length, 1)
  assert.equal(canvas.getObjects()[0].mathboardId, 'mbobj_keep')
  assert.equal(historyReset, false)
})

test('successful replace resets history callback', async () => {
  const canvas = makeCanvas([new Rect({ width: 1, height: 1 })])
  let historyReset = false
  await replaceBoardFromDocument({
    canvas,
    document: {
      format: 'mathboard-board',
      version: 1,
      title: 'ok',
      objects: [{
        id: 'mbobj_new',
        type: 'rect',
        width: 12,
        height: 8,
        left: 2,
        top: 3,
      }],
    },
    buildFormula: async () => null,
    resetHistory: () => {
      historyReset = true
    },
  })
  assert.equal(historyReset, true)
  assert.equal(canvas.getObjects().length, 1)
  assert.equal(canvas.getObjects()[0].mathboardId, 'mbobj_new')
})
