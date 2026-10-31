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
import { Ellipse, ActiveSelection } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardController } from '../src/board/BoardController.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { validateBoardDocument } from '../src/board/persistence/schema.js'
import { serializeBoardDocument } from '../src/board/persistence/serializeBoardDocument.js'
import { materializeBoardDocument } from '../src/board/persistence/materializeBoardDocument.js'
import { materializeStampDocument } from '../src/stamps/materialize.js'
import { stampDocumentFromObjects } from '../src/stamps/serialize.js'
import { validateStampDocument } from '../src/stamps/schema.js'
import { applyAutoInk, applyExplicitInk, paletteColorFromObject } from '../src/config/colors.js'

installFabricDomStub()
const policy = new BoardObjectPolicy()
const spec = { type: 'ellipse', rx: 70, ry: 35, left: 180, top: 140,
  stroke: '#123456', fill: '#ffeedd', mathboardInkMode: 'fixed' }
function setup() {
  const canvas = makeControllerCanvas()
  const history = []
  const controller = new BoardController({ getCanvas: () => canvas, boardObjectPolicy: policy,
    buildFormula: async () => null, pushHistoryCommand: (command) => history.push(command), isMutationStable: () => true })
  return { canvas, controller, history }
}

test('semantic ellipse preserves radii, explicit origins, paint and identity across document and Stamp', async () => {
  const { canvas, controller } = setup()
  const node = await controller.create({ ...spec, originX: 0.25, angle: 28, scaleX: 1.3 })
  assert.equal(node.rx, 70)
  assert.equal(node.ry, 35)
  assert.equal(node.originX, 0.25)
  assert.equal(policy.kindOf(canvas.getObjects()[0]), 'shape')
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  const restored = await materializeBoardDocument(doc, { buildFormula: async () => null })
  assert.equal(restored.objects[0].mathboardId, node.id)
  assert.deepEqual(restored.objects[0].getBoundingRect(), canvas.getObjects()[0].getBoundingRect())
  const stamp = stampDocumentFromObjects(canvas.getObjects())
  validateStampDocument(stamp)
  const copies = await materializeStampDocument(stamp, { buildFormula: async () => null })
  assert.equal(copies[0].rx, 70)
  assert.equal(copies[0].ry, 35)
  assert.equal(copies[0].fill, '#ffeedd')
  assert.equal(copies[0].stroke, '#123456')
})

test('ellipse rejects missing, negative and nonfinite radii before mutation', async () => {
  const { controller, history } = setup()
  for (const patch of [{ rx: undefined }, { ry: undefined }, { rx: -1 }, { ry: NaN }, { rx: Infinity }]) {
    await assert.rejects(() => controller.create({ ...spec, ...patch }), (error) => error.code === 'invalid_object_spec')
  }
  assert.deepEqual(controller.getObjects(), [])
  assert.equal(history.length, 0)
  await assert.rejects(() => controller.create({ ...spec, rx: 0, ry: 0 }),
    (error) => error.code === 'invalid_object_spec')
})

test('ellipse in a transformed selection preserves scene bounds and radii across move and delete Undo payloads', async () => {
  const { canvas, controller, history } = setup()
  const nodes = await controller.createMany([spec, { ...spec, left: 400 }])
  const selection = new ActiveSelection(canvas.getObjects())
  selection.set({ angle: 30, scaleX: 1.5, scaleY: 0.8 })
  selection.setCoords()
  canvas.setActiveObject(selection)
  const before = controller.observe().objects
  const removed = await controller.clear()
  assert.equal(removed[0].rx, 70)
  for (const { object, index } of history.at(-1).entries) canvas.insertAt(index, object)
  const after = controller.observe().objects
  for (let i = 0; i < nodes.length; i++) {
    for (const key of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(before[i].bounds[key] - after[i].bounds[key]) < 1e-8)
  }
})

test('ellipse AUTO recolors all painted surfaces, preserving absent paint', () => {
  const shape = new Ellipse({ rx: 70, ry: 35, stroke: '#123456', fill: '#ffeedd' })
  shape.mathboardInkMode = 'auto'
  assert.equal(applyAutoInk(shape, '#ffffff'), true)
  assert.equal(shape.fill, '#ffffff')
  assert.equal(shape.stroke, '#ffffff')
  assert.equal(applyExplicitInk(shape, '#1976d2'), true)
  assert.equal(shape.fill, '#1976d2')
  assert.equal(paletteColorFromObject(shape), '#1976d2')
  for (const fill of [null, 'none', 'transparent']) {
    shape.set({ fill })
    applyAutoInk(shape, '#000000')
    assert.equal(shape.fill, fill)
  }
})

test('ellipse geometry validation also guards document and Stamp imports', async () => {
  const { canvas, controller } = setup()
  await controller.create(spec)
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  const stamp = stampDocumentFromObjects(canvas.getObjects())
  for (const invalid of [-1, null, undefined, Infinity]) {
    const badDoc = structuredClone(doc)
    const badStamp = structuredClone(stamp)
    badDoc.objects[0].ry = invalid
    badStamp.objects[0].ry = invalid
    assert.throws(() => validateBoardDocument(badDoc), (error) => error.code === 'board_document_invalid')
    assert.throws(() => validateStampDocument(badStamp), (error) => error.code === 'stamp_invalid_shape')
  }
})

test('nested transformed ellipses preserve local geometry, child IDs and distinct fixed paint', async () => {
  const { canvas, controller } = setup()
  const root = await controller.create({ type: 'group', left: 450, top: 250, angle: 35,
    scaleY: 0.7, objects: [spec, { ...spec, left: 420, fill: null }] })
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  const restored = await materializeBoardDocument(doc, { buildFormula: async () => null })
  const again = serializeBoardDocument({ canvas: makeControllerCanvas(restored.objects), boardObjectPolicy: policy })
  assert.deepEqual(again, doc)
  assert.equal(again.objects[0].objects[0].id, root.objects[0].id)
  assert.equal(again.objects[0].objects[0].fill, '#ffeedd')
})
