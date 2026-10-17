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
import { Path, Rect, ActiveSelection } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { FormulaObject } from '../src/formulas/FormulaObject.js'
import { materializeBoardObject } from '../src/board/objects/materialize.js'
import { readSemanticBoardObject } from '../src/board/objects/serialize.js'
import { BoardController } from '../src/board/BoardController.js'
import { stampDocumentFromObjects } from '../src/stamps/serialize.js'
import { validateStampDocument } from '../src/stamps/schema.js'
import { validateBoardDocument } from '../src/board/persistence/schema.js'
import { materializeStampDocument } from '../src/stamps/materialize.js'
import { serializeBoardDocument } from '../src/board/persistence/serializeBoardDocument.js'
import { materializeBoardDocument } from '../src/board/persistence/materializeBoardDocument.js'
import { applySnapshot } from '../src/history/commandLog.js'

installFabricDomStub()
const buildFormula = async (spec) => new FormulaObject([new Path('M 0 0 L 20 20')], spec)
function setup() {
  const canvas = makeControllerCanvas()
  const history = []
  const controller = new BoardController({ getCanvas: () => canvas,
    boardObjectPolicy: new BoardObjectPolicy(), buildFormula,
    pushHistoryCommand: (command) => history.push(command), isMutationStable: () => true })
  return { canvas, controller, history }
}
const specs = [
  { type: 'text', text: 'Complete the square' },
  { type: 'formula', latex: 'x^2+6x=7' },
  { type: 'rect', width: 80, height: 30 },
  { type: 'circle', radius: 20 },
  { type: 'line', x1: 40, y1: 50, x2: 80, y2: 90 },
  { type: 'path', path: [['M', 40, 50], ['L', 80, 90]] },
  { type: 'group', objects: [{ type: 'rect', width: 30, height: 20 }] },
]
for (const spec of specs) {
  test(`${spec.type}: programmable creation defaults to left/top`, async () => {
    const { controller, canvas } = setup()
    const input = { ...spec, left: 160, top: 200 }
    const node = await controller.create(input)
    assert.equal(node.originX, 'left')
    assert.equal(node.originY, 'top')
    assert.equal(node.left, 160)
    assert.equal(node.top, 200)
    if (node.objects) assert.equal(node.objects[0].originX, 'left')
    assert.equal(input.originX, undefined)
    const bounds = canvas.getObjects()[0].getBoundingRect()
    assert.equal(bounds.left, 160)
    assert.equal(bounds.top, 200)
  })
}

test('explicit named and numeric origins remain authoritative on each axis', async () => {
  const { controller } = setup()
  for (const origin of ['center', 0.25]) {
    const node = await controller.create({ ...specs[2], left: 160, top: 200, originX: origin })
    assert.equal(node.originX, origin)
    assert.equal(node.originY, 'top')
  }
})

test('line endpoints and path commands keep intrinsic placement when left/top are omitted', async () => {
  const { controller, canvas } = setup()
  for (const spec of specs.slice(4, 6)) {
    await controller.create({ ...spec, strokeWidth: 0 })
    const bounds = canvas.getObjects().at(-1).getBoundingRect()
    assert.equal(bounds.left, 40)
    assert.equal(bounds.top, 50)
    assert.equal(bounds.width, 40)
    assert.equal(bounds.height, 40)
  }
})

test('legacy materialization and UI defaults keep center origins without migration', async () => {
  const node = await materializeBoardObject({ ...specs[2], left: 160, top: 200 }, { buildFormula })
  assert.equal(node.originX, 'center')
  assert.equal(node.originY, 'center')
  assert.equal(node.left, 160)
  assert.equal(new Rect().originX, 'center')
})

test('transformed group-local geometry survives semantic create/read/materialize round trips', async () => {
  const { controller, canvas } = setup()
  const created = await controller.create({ type: 'group', left: 250, top: 180,
    angle: 23, scaleX: 1.7, scaleY: 0.8, objects: [
      { ...specs[2], left: -50, top: 20, angle: 17 },
      { ...specs[1], left: 60, top: -30, originX: 'center', originY: 'center' },
    ] })
  const original = canvas.getObjects()[0]
  const restored = await materializeBoardObject(created, { buildFormula, restoreIds: true })
  const compare = (a, b) => a.forEach((value, index) => assert.ok(Math.abs(value - b[index]) < 1e-8))
  compare(original.calcTransformMatrix(), restored.calcTransformMatrix())
  original.getObjects().forEach((child, i) => compare(child.calcTransformMatrix(), restored.getObjects()[i].calcTransformMatrix()))
  assert.deepEqual(readSemanticBoardObject(restored).objects.map((o) => o.id), created.objects.map((o) => o.id))
})

test('selected transformed members read scene coordinates; updates/history preserve origins under pan/zoom', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany(specs.slice(1, 3).map((spec, i) => ({ ...spec, left: 160+i*100, top: 200 })))
  const selection = new ActiveSelection(canvas.getObjects())
  canvas.setActiveObject(selection)
  selection.set({ angle: 15, scaleX: 1.2, left: 400 })
  selection.setCoords()
  const before = controller.get(nodes[0].id)
  canvas.viewportTransform = [2, 0, 0, 2, 300, -70]
  assert.deepEqual(controller.get(nodes[0].id), before)
  assert.equal(controller.observe().objects[0].left, before.left)
  const after = await controller.update(nodes[0].id, { left: 500, top: 320, latex: 'x=2' })
  assert.equal(after.originX, 'left')
  assert.equal(after.left, 500)
  const replace = history.at(-1)
  assert.equal(replace.type, 'replace')
  assert.equal(replace.removed.originX, 'left')
  const moved = await controller.update(nodes[1].id, { left: 550, originX: 'center' })
  assert.equal(moved.left, 550)
  assert.equal(moved.originX, 'center')
  const command = history.at(-1)
  applySnapshot(command.entries[0].object, command.entries[0].before)
  assert.equal(controller.get(nodes[1].id).originX, 'left')
  applySnapshot(command.entries[0].object, command.entries[0].after)
  assert.equal(controller.get(nodes[1].id).left, 550)
})


test('old documents and stamps retain omitted and explicit origins after new creation', async () => {
  const { canvas, controller } = setup()
  await controller.create(specs[2])
  const old = await materializeBoardObject({ ...specs[2], left: 300, top: 120 }, { buildFormula })
  const centeredFormula = await buildFormula({ latex: 'x=1', left: 210, top: 90, originX: 'center', originY: 'center' })
  const oldCanvas = makeControllerCanvas([old, centeredFormula])
  const doc = serializeBoardDocument({ canvas: oldCanvas, boardObjectPolicy: new BoardObjectPolicy() })
  // Older semantic documents can omit origins: their original Fabric default remains center.
  delete doc.objects[0].originX
  delete doc.objects[0].originY
  const restored = await materializeBoardDocument(doc, { buildFormula })
  const stamp = await materializeStampDocument({ objects: doc.objects }, { buildFormula })
  for (const objects of [restored.objects, stamp]) {
    objects.forEach((object, index) => {
      assert.equal(object.originX, 'center')
      assert.equal(object.originY, 'center')
      assert.deepEqual(object.getBoundingRect(), oldCanvas.getObjects()[index].getBoundingRect())
    })
  }
  assert.equal(canvas.getObjects()[0].originX, 'left')
})


for (const format of ['BoardDocument', 'Stamp']) {
  test(`${format} round trip preserves numeric origins on nested objects and both axes`, async () => {
    const { canvas, controller } = setup()
    await controller.create({ type: 'group', left: 200, top: 150, originX: 0.25, originY: 0.8,
      angle: 20, scaleX: 1.3, objects: [
        { ...specs[2], left: 30, top: 40, originX: 0.6, originY: -0.2 },
        { ...specs[1], left: 140, top: 50, originX: 0, originY: 1 },
      ] })
    const original = canvas.getObjects()[0]
    const doc = format === 'Stamp' ? validateStampDocument(stampDocumentFromObjects([original]))
      : validateBoardDocument(serializeBoardDocument({ canvas, boardObjectPolicy: new BoardObjectPolicy() }))
    const restored = format === 'Stamp' ? await materializeStampDocument(doc, { buildFormula })
      : (await materializeBoardDocument(doc, { buildFormula })).objects
    const compare = (a, b) => {
      assert.equal(b.originX, a.originX)
      assert.equal(b.originY, a.originY)
      a.calcTransformMatrix().forEach((value, i) => assert.ok(Math.abs(value-b.calcTransformMatrix()[i]) < 1e-8))
    }
    compare(original, restored[0])
    original.getObjects().forEach((child, i) => compare(child, restored[0].getObjects()[i]))
    for (const invalid of [Infinity, NaN, 'unknown', true, {}, []]) {
      const copy = structuredClone(doc)
      copy.objects[0].objects[0].originY = invalid
      assert.throws(() => format === 'Stamp' ? validateStampDocument(copy) : validateBoardDocument(copy))
    }
  })
}
