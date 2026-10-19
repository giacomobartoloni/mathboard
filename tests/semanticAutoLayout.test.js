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
import { Path, ActiveSelection } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { FormulaObject } from '../src/formulas/FormulaObject.js'
import { applySnapshot } from '../src/history/commandLog.js'
import { workspaceSafeArea } from '../src/board/layout/workspaceSafeArea.js'
import { BoardController } from '../src/board/BoardController.js'
installFabricDomStub()
function setup(extra = {}) {
  const canvas = makeControllerCanvas(), history = []
  canvas.fire = () => {}
  const controller = new BoardController({ getCanvas: () => canvas, boardObjectPolicy: new BoardObjectPolicy(),
    buildFormula: async (spec) => new FormulaObject([new Path('M0 0 L80 0 L80 30 L0 30 Z')], spec),
    pushHistoryCommand: (command) => history.push(command), isMutationStable: () => true,
    getLayoutSafeArea: () => ({ left: 90, top: 80, width: 900, height: 600 }), ...extra })
  return { canvas, history, controller }
}
const specs = [{ type: 'rect', left: 600, top: 300, width: 100, height: 40, strokeWidth: 0 },
  { type: 'formula', latex: 'x=2', left: 400, top: 500, originX: 'center', originY: 'center', angle: 25 }]
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
test('measure is detached, read-only scene geometry under viewport pan and zoom', async () => {
  const { controller, canvas, history } = setup()
  const [node] = await controller.createMany(specs)
  canvas.viewportTransform = [2, 0, 0, 2, 50, -40]
  const before = controller.observe(), count = history.length
  const measured = controller.measure(node.id)
  assert.deepEqual(measured, { id: node.id, left: 600, top: 300, width: 100, height: 40 })
  measured.left = 0
  assert.deepEqual(controller.observe(), before)
  assert.equal(history.length, count)
})
test('stack uses actual formula bounds, preserves origins and commits one undoable modify', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany(specs), before = controller.observe()
  const result = await controller.layout({ ids: nodes.map(n => n.id), direction: 'stack', gap: 20 })
  assert.equal(history.length, 2)
  assert.equal(history[1].type, 'modify')
  const [first, second] = result.objects
  near(first.bounds.left, 106); near(first.bounds.top, 96)
  near(second.bounds.left, 106); near(second.bounds.top, 156)
  assert.equal(second.originX, 'center'); assert.equal(second.angle, 25)
  for (const e of history[1].entries) applySnapshot(e.object, e.before)
  assert.deepEqual(controller.observe().objects, before.objects)
  for (const e of history[1].entries) applySnapshot(e.object, e.after)
  assert.deepEqual(controller.observe().objects, result.objects)
  assert.equal(canvas.getObjects()[1].latex, 'x=2')
})
test('row respects requested order, safe margin and translated viewport; no-op keeps history', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany(specs)
  canvas.viewportTransform = [2, 0, 0, 2, 50, -40]
  const ids = [nodes[1].id, nodes[0].id]
  const result = await controller.layout({ ids, direction: 'row', gap: 12, margin: 10 })
  near(result.objects[0].bounds.left, 25); near(result.objects[0].bounds.top, 65)
  near(result.objects[1].bounds.left, 25 + result.objects[0].bounds.width + 12)
  near(result.objects[1].bounds.top, 65)
  const count = history.length
  await controller.layout({ ids, direction: 'row', gap: 12, margin: 10 })
  assert.equal(history.length, count)
})
test('validation and overflow are atomic, including malformed IDs and unsupported options', async () => {
  const { controller, history } = setup()
  const nodes = await controller.createMany(specs), before = controller.observe()
  for (const options of [{ ids: [] }, { ids: [nodes[0].id, nodes[0].id] }, { ids: ['unknown'] },
    { ids: [nodes[0].id], gap: -1 }, { ids: [nodes[0].id], direction: 'grid' },
    { ids: [nodes[0].id], margin: Infinity }, { ids: [nodes[0].id], left: 0 },
    { ids: [nodes[0].id], top: 1000 }, { ids: [nodes[0].id], arbitrary: true }]) {
    await assert.rejects(() => controller.layout(options))
    assert.deepEqual(controller.observe(), before)
    assert.equal(history.length, 1)
  }
})
test('history failure restores transformed selection and scene exactly', async () => {
  let fail = false
  const { controller, canvas } = setup({ pushHistoryCommand: () => { if (fail) throw Error('history failed') } })
  await controller.createMany(specs)
  const selection = new ActiveSelection(canvas.getObjects(), { canvas })
  selection.set({ angle: 12, scaleX: 1.2, scaleY: 0.8 }); selection.setCoords(); canvas.setActiveObject(selection)
  const before = controller.observe(); fail = true
  await assert.rejects(() => controller.layout({ ids: before.objects.map(n => n.id) }))
  const after = controller.observe()
  assert.deepEqual(after, before)
  assert.equal(canvas.getActiveObject(), selection)
})

test('layout supports semantic groups but rejects their children before mutation', async () => {
  const { controller, history } = setup()
  const group = await controller.create({ type: 'group', left: 400, top: 300,
    objects: [{ type: 'rect', width: 80, height: 40 }, { type: 'formula', latex: 'x=1', left: 100, top: 20 }] })
  const before = controller.observe()
  await assert.rejects(() => controller.layout({ ids: [group.objects[0].id] }), e => e.code === 'nested_object_mutation_not_supported')
  assert.deepEqual(controller.observe(), before)
  const result = await controller.layout({ ids: [group.id] })
  near(result.objects[0].bounds.left, 106); near(result.objects[0].bounds.top, 96)
  assert.equal(result.objects[0].objects[1].id, group.objects[1].id)
  assert.equal(history.length, 2)
})
test('invalid viewport or geometry rejects without scene mutation', async () => {
  const { controller, canvas, history } = setup()
  const [node] = await controller.createMany(specs)
  canvas.viewportTransform = [1, 0.2, 0, 1, 0, 0]
  const before = controller.observe()
  await assert.rejects(() => controller.layout({ ids: [node.id] }), e => e.code === 'invalid_object_spec')
  assert.deepEqual(controller.observe(), before); assert.equal(history.length, 1)
})

test('selected skewed roots use committed bounds so row gaps remain exact', async () => {
  const { controller, canvas } = setup()
  await controller.createMany(specs)
  const selection = new ActiveSelection(canvas.getObjects(), { canvas })
  selection.set({ angle: 23, scaleX: 1.3, scaleY: 0.8, skewX: 8 }); selection.setCoords(); canvas.setActiveObject(selection)
  const ids = controller.observe().objects.map(n => n.id)
  const result = await controller.layout({ ids, direction: 'row', gap: 24 })
  near(result.objects[1].bounds.left - result.objects[0].bounds.left - result.objects[0].bounds.width, 24)
  near(result.objects[1].bounds.top, result.objects[0].bounds.top)
  near(result.objects[0].bounds.left, 106)
})

test('viewport safe area clears visible cookie banner and protruding tool submenu', () => {
  const rects = { '.left-chrome': { left: 12, right: 66, top: 120, bottom: 590, width: 54, height: 470 },
    '.cookie-banner': { left: 0, right: 1280, top: 640, bottom: 800, width: 1280, height: 160 },
    '.left-chrome .shapes-submenu': { left: 76, right: 260, top: 250, bottom: 420, width: 184, height: 170 } }
  const root = { querySelector: s => rects[s] ? { getClientRects: () => [1], getBoundingClientRect: () => rects[s] } : null }
  const canvas = { getWidth: () => 1280, getHeight: () => 800,
    upperCanvasEl: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } }
  assert.deepEqual(workspaceSafeArea(canvas, root), { left: 260, top: 0, width: 1020, height: 640 })
})

test('measuring selected text does not replace its mutable style metadata', async () => {
  const { controller, canvas } = setup()
  await controller.createMany([{type:'text',text:'Styled',left:200,top:200}, specs[0]])
  const object = canvas.getObjects()[0]
  object.styles = {0:{0:{fill:'#ff0000'}}}
  const original = object.styles
  const selection = new ActiveSelection(canvas.getObjects(), {canvas})
  selection.set({angle:15,scaleX:1.2}); selection.setCoords(); canvas.setActiveObject(selection)
  const before = controller.observe()
  controller.measure(object.mathboardId)
  assert.equal(object.styles, original)
  assert.deepEqual(controller.observe(), before)
})
