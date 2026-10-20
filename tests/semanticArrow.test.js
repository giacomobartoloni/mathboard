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
import { ActiveSelection } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardController } from '../src/board/BoardController.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { serializeBoardDocument } from '../src/board/persistence/serializeBoardDocument.js'
import { materializeBoardDocument } from '../src/board/persistence/materializeBoardDocument.js'
import { materializeStampDocument } from '../src/stamps/materialize.js'
import { stampDocumentFromObjects } from '../src/stamps/serialize.js'
import { validateStampDocument } from '../src/stamps/schema.js'
import { validateBoardDocument } from '../src/board/persistence/schema.js'
import { applyAutoInk, flattenInkTargets } from '../src/config/colors.js'

installFabricDomStub()
const policy = new BoardObjectPolicy()
const spec = { type: 'arrow', x1: 10, y1: 20, x2: 110, y2: 20, headLength: 20, headWidth: 12,
  stroke: '#1565c0', fill: '#ff8800', mathboardInkMode: 'fixed' }
function setup() {
  const canvas = makeControllerCanvas()
  const history = []
  const controller = new BoardController({ getCanvas: () => canvas, boardObjectPolicy: policy,
    buildFormula: async () => null, pushHistoryCommand: (entry) => history.push(entry), isMutationStable: () => true })
  return { controller, canvas, history }
}

test('arrow owns one semantic shape and a hand-checked terminal head, distinct from legacy line', async () => {
  const { controller, canvas } = setup()
  const node = await controller.create(spec)
  const arrow = canvas.getObjects()[0]
  assert.equal(node.type, 'arrow')
  assert.equal(node.x1, 10)
  assert.equal(node.x2, 110)
  assert.equal(node.headLength, 20)
  assert.equal(node.headWidth, 12)
  assert.equal(node.path, undefined)
  assert.equal(node.objects, undefined)
  assert.deepEqual(arrow.path, [['M', 10, 20], ['L', 90, 20], ['M', 90, 26], ['L', 110, 20], ['L', 90, 14], ['Z']])
  assert.equal(policy.kindOf(arrow), 'shape')
  assert.equal(policy.isBoardGroup(arrow), false)
  assert.equal(policy.capabilitiesOf(arrow).ungroup, false)
  assert.deepEqual(flattenInkTargets([arrow]), [arrow])
  const line = await controller.create({ type: 'line', x1: 10, y1: 20, x2: 110, y2: 20 })
  assert.equal(line.type, 'line')
})

test('arrow defaults, reverse directions and short segments produce finite head-inclusive geometry', async () => {
  const { controller, canvas } = setup()
  for (const [x2, y2] of [[110, 20], [-90, 20], [10, 120], [10, -80], [-60, -50], [12, 20]]) {
    const node = await controller.create({ ...spec, x2, y2, headLength: undefined, headWidth: undefined })
    assert.equal(node.headLength, 16)
    assert.equal(node.headWidth, 12)
    const arrow = canvas.getObjects().at(-1)
    assert.ok(arrow.width > 0 && arrow.height > 0)
    assert.ok(arrow.path.flat().every((value) => typeof value === 'string' || Number.isFinite(value)))
    assert.deepEqual(arrow.path[3], ['L', x2, y2])
    if (x2 === 12) assert.deepEqual(arrow.path[1], ['L', 10, 20])
  }
})

test('arrow transforms, clone, document and Stamp preserve semantic endpoints, paint and identity', async () => {
  const { controller, canvas } = setup()
  const node = await controller.create({ ...spec, left: 250, top: 220, angle: 37, scaleY: 1.3, originX: 0.25 })
  const original = canvas.getObjects()[0]
  const clone = await original.clone(['mathboardId'])
  assert.equal(policy.kindOf(clone), 'shape')
  assert.equal(clone.mathboardShapeType, 'arrow')
  assert.deepEqual(clone.path, original.path)
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  const restored = await materializeBoardDocument(doc, { buildFormula: async () => null })
  assert.deepEqual(serializeBoardDocument({ canvas: makeControllerCanvas(restored.objects), boardObjectPolicy: policy }), doc)
  const stamp = stampDocumentFromObjects(canvas.getObjects())
  validateStampDocument(stamp)
  const copies = await materializeStampDocument(stamp, { buildFormula: async () => null })
  assert.equal(copies[0].mathboardShapeType, 'arrow')
  assert.equal(copies[0].fill, '#ff8800')
  assert.equal(copies[0].stroke, '#1565c0')
  assert.deepEqual(copies[0].path, original.path)
  assert.equal(restored.objects[0].mathboardId, node.id)
})

test('arrow rejects invalid endpoints/head dimensions consistently before mutation and imports', async () => {
  const { controller, canvas, history } = setup()
  await controller.create(spec)
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  const stamp = stampDocumentFromObjects(canvas.getObjects())
  for (const patch of [{ x1: undefined }, { x2: NaN }, { y2: Infinity }, { x2: 10, y2: 20 },
    { headLength: 0 }, { headWidth: -1 }, { headLength: null }, { headWidth: Infinity }]) {
    await assert.rejects(() => controller.create({ ...spec, ...patch }), (error) => error.code === 'invalid_object_spec')
    const badDoc = structuredClone(doc)
    const badStamp = structuredClone(stamp)
    Object.assign(badDoc.objects[0], patch)
    Object.assign(badStamp.objects[0], patch)
    assert.throws(() => validateBoardDocument(badDoc), (error) => error.code === 'board_document_invalid')
    assert.throws(() => validateStampDocument(badStamp), (error) => error.code === 'stamp_invalid_shape')
  }
  assert.equal(controller.getObjects().length, 1)
  assert.equal(history.length, 1)
})

test('arrow selected scene transforms survive delete Undo payload and AUTO recolors the filled head', async () => {
  const { controller, canvas, history } = setup()
  await controller.createMany([spec, { ...spec, left: 400 }])
  const selection = new ActiveSelection(canvas.getObjects())
  selection.set({ angle: 25, scaleX: 1.3, skewX: 12 })
  selection.setCoords()
  canvas.setActiveObject(selection)
  const matrices = canvas.getObjects().map((object) => object.calcTransformMatrix())
  await controller.clear()
  for (const { object, index } of history.at(-1).entries) canvas.insertAt(index, object)
  canvas.getObjects().forEach((object, i) => {
    object.calcTransformMatrix().forEach((value, j) => assert.ok(Math.abs(value - matrices[i][j]) < 1e-8))
    applyAutoInk(object, '#f5f5f5')
    assert.equal(object.fill, '#f5f5f5')
    assert.equal(object.stroke, '#f5f5f5')
    assert.equal(controller.get(object.mathboardId).x2, 110)
  })
})

test('arrows remain atomic semantic descendants of transformed Board Groups', async () => {
  const { controller, canvas } = setup()
  const root = await controller.create({ type: 'group', left: 350, top: 240, angle: 24, scaleX: 1.4,
    objects: [spec, { type: 'text', text: 'Force', top: 50 }] })
  assert.equal(root.objects[0].type, 'arrow')
  assert.equal(root.objects[0].objects, undefined)
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  const restored = await materializeBoardDocument(doc, { buildFormula: async () => null })
  assert.deepEqual(serializeBoardDocument({ canvas: makeControllerCanvas(restored.objects), boardObjectPolicy: policy }), doc)
  assert.equal(policy.capabilitiesOf(restored.objects[0].getObjects()[0]).ungroup, false)
})
