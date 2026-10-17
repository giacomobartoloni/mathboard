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
import { ActiveSelection, Polygon } from 'fabric'
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
import { applyAutoInk, paletteColorFromObject } from '../src/config/colors.js'

installFabricDomStub()
const policy = new BoardObjectPolicy()
const spec = { type: 'polygon', points: [{ x: -40, y: 10 }, { x: 140, y: 10 }, { x: -40, y: 150 }],
  left: 220, top: 180, fill: '#fff0aa', stroke: '#1565c0', mathboardInkMode: 'fixed' }
function setup() {
  const canvas = makeControllerCanvas()
  const history = []
  const controller = new BoardController({ getCanvas: () => canvas, boardObjectPolicy: policy,
    buildFormula: async () => null, pushHistoryCommand: (entry) => history.push(entry), isMutationStable: () => true })
  return { controller, canvas, history }
}

test('filled semantic polygon has detached points and round-trips intrinsic geometry and paint', async () => {
  const { controller, canvas } = setup()
  const input = structuredClone(spec)
  const node = await controller.create({ ...input, angle: 22, originX: 0.25 })
  input.points[0].x = 999
  assert.deepEqual(node.points, spec.points)
  node.points[1].y = 999
  assert.deepEqual(controller.get(node.id).points, spec.points)
  assert.equal(policy.kindOf(canvas.getObjects()[0]), 'shape')
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  const restored = await materializeBoardDocument(doc, { buildFormula: async () => null })
  assert.deepEqual(serializeBoardDocument({ canvas: makeControllerCanvas(restored.objects), boardObjectPolicy: policy }), doc)
  const stamp = stampDocumentFromObjects(canvas.getObjects())
  validateStampDocument(stamp)
  const copies = await materializeStampDocument(stamp, { buildFormula: async () => null })
  assert.deepEqual(copies[0].points, spec.points)
  assert.equal(copies[0].fill, '#fff0aa')
  assert.equal(copies[0].stroke, '#1565c0')
})

test('polygon rejects invalid point arrays before creation and at both import boundaries', async () => {
  const { controller, canvas, history } = setup()
  await controller.create(spec)
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  const stamp = stampDocumentFromObjects(canvas.getObjects())
  for (const points of [undefined, null, [], spec.points.slice(1), new Array(3),
    [{ x: 0, y: 0 }, { x: Infinity, y: 1 }, { x: 2, y: 3 }],
    [{ x: 0, y: 0 }, { x: 1 }, { x: 2, y: 3 }], Array.from({ length: 1001 }, () => ({ x: 0, y: 0 }))]) {
    await assert.rejects(() => controller.create({ ...spec, points }), (error) => error.code === 'invalid_object_spec')
    const badDoc = structuredClone(doc)
    const badStamp = structuredClone(stamp)
    badDoc.objects[0].points = points
    badStamp.objects[0].points = points
    assert.throws(() => validateBoardDocument(badDoc), (error) => error.code === 'board_document_invalid')
    assert.throws(() => validateStampDocument(badStamp), (error) => error.code === 'stamp_invalid_shape')
  }
  assert.equal(controller.getObjects().length, 1)
  assert.equal(history.length, 1)
})

test('polygon selection transform and clear retain geometry, while AUTO follows all painted surfaces', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([spec, { ...spec, left: 500 }])
  const active = new ActiveSelection(canvas.getObjects())
  active.set({ angle: 35, scaleX: 1.4, skewX: 10 })
  active.setCoords()
  canvas.setActiveObject(active)
  const matrices = canvas.getObjects().map((object) => object.calcTransformMatrix())
  await controller.clear()
  for (const { object, index } of history.at(-1).entries) canvas.insertAt(index, object)
  const after = controller.observe().objects
  for (let i = 0; i < nodes.length; i++) {
    assert.deepEqual(after[i].points, spec.points)
    // Fabric's conservative AABB changes after skew decomposition; the actual
    // scene transform (and therefore every painted vertex) must stay identical.
    canvas.getObjects()[i].calcTransformMatrix().forEach((value, j) => assert.ok(Math.abs(value - matrices[i][j]) < 1e-8))
  }
  const polygon = new Polygon(spec.points, { fill: '#fff0aa', stroke: '#1565c0' })
  assert.equal(applyAutoInk(polygon, '#f5f5f5'), true)
  assert.equal(polygon.fill, '#f5f5f5')
  assert.equal(polygon.stroke, '#f5f5f5')
  polygon.fill = null
  applyAutoInk(polygon, '#000000')
  assert.equal(polygon.fill, null)
  polygon.mathboardInkMode = 'fixed'
  assert.equal(paletteColorFromObject(polygon), '#000000')
})

test('transformed group-local polygons retain points and child identity on rematerialization', async () => {
  const { controller, canvas } = setup()
  const group = await controller.create({ type: 'group', left: 300, top: 240, scaleX: 1.2, angle: 26,
    objects: [spec, { ...spec, left: 510, top: 260, fill: null }] })
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  const restored = await materializeBoardDocument(doc, { buildFormula: async () => null })
  const again = serializeBoardDocument({ canvas: makeControllerCanvas(restored.objects), boardObjectPolicy: policy })
  assert.deepEqual(again, doc)
  assert.equal(again.objects[0].objects[0].id, group.objects[0].id)
  assert.deepEqual(again.objects[0].objects[0].points, spec.points)
})
