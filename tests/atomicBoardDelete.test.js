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
import { ActiveSelection, Path } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { FormulaObject } from '../src/formulas/FormulaObject.js'
import { BoardController, BOARD_CONTROLLER_ERROR_CODES as C } from '../src/board/BoardController.js'

installFabricDomStub()

function setup() {
  const canvas = makeControllerCanvas()
  const history = []
  let rejectHistory = false
  const controller = new BoardController({
    getCanvas: () => canvas,
    boardObjectPolicy: new BoardObjectPolicy(),
    buildFormula: async (spec) => new FormulaObject([new Path('M 0 0 L 20 20')], { ...spec, latex: spec.latex }),
    pushHistoryCommand: (command) => {
      if (rejectHistory) throw new Error('history unavailable')
      history.push(command)
    },
    isMutationStable: () => true,
  })
  return { canvas, history, controller, rejectHistory: () => { rejectHistory = true } }
}
const rect = { type: 'rect', left: 100, top: 150, width: 50, height: 40 }
const formula = { type: 'formula', latex: 'x=1', mathboardInkMode: 'fixed', fill: '#123456' }
const rejectsCode = (operation, code) => assert.rejects(operation, (error) => error.code === code)

// The real command replay is covered through the browser bridge; this checks
// that retained entries alone carry all runtime state needed by that replay.
function restore(canvas, command) {
  for (const { object, index } of command.entries) canvas.insertAt(index, object)
}

test('deleteMany returns detached roots in canvas order and retains one sorted delete command', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([rect, formula, rect, { type: 'group', objects: [rect, formula] }])
  const original = canvas.getObjects()
  const removed = await controller.deleteMany([nodes[3].id, nodes[0].id, nodes[1].id])
  assert.deepEqual(removed, [nodes[0], nodes[1], nodes[3]])
  assert.deepEqual(controller.getObjects(), [nodes[2]])
  assert.equal(history.length, 2)
  const command = history.at(-1)
  assert.equal(command.type, 'delete')
  assert.deepEqual(command.entries.map(({ index }) => index), [0, 1, 3])
  assert.deepEqual(command.entries.map(({ object }) => object), [original[0], original[1], original[3]])
  removed[2].objects[0].left = 999
  restore(canvas, command)
  assert.deepEqual(canvas.getObjects(), original)
  assert.deepEqual(controller.getObjects(), nodes)
})

test('clear retains all semantic roots and metadata without changing board or viewport identity', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([rect, formula, { type: 'group', objects: [formula, rect] }])
  canvas.viewportTransform = [2, 0, 0, 2, 45, 20]
  const before = controller.observe()
  assert.deepEqual(await controller.clear(), nodes)
  assert.equal(canvas.getObjects().length, 0)
  assert.equal(history.length, 2)
  restore(canvas, history.at(-1))
  assert.deepEqual(controller.getObjects(), nodes)
  assert.equal(controller.observe().boardId, before.boardId)
  assert.deepEqual(canvas.viewportTransform, [2, 0, 0, 2, 45, 20])
})

test('empty deletion and clear do not commit a command, preserving a redo tail', async () => {
  const { controller, canvas, history } = setup()
  await controller.create(rect)
  const redo = history[0]
  canvas.remove(canvas.getObjects()[0])
  assert.deepEqual(await controller.deleteMany([]), [])
  assert.deepEqual(await controller.clear(), [])
  assert.deepEqual(history, [redo])
})

test('deleteMany rejects all malformed arrays and duplicate IDs before changing selection', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([rect, rect])
  const selected = new ActiveSelection(canvas.getObjects())
  canvas.setActiveObject(selected)
  const before = controller.getObjects()
  for (const ids of [undefined, null, {}, 'id', [null], [''], ['  '], [5], [nodes[0].id, nodes[0].id], new Array(1)]) {
    await rejectsCode(() => controller.deleteMany(ids), C.INVALID_SPEC)
    assert.equal(canvas.getActiveObject(), selected)
    assert.deepEqual(controller.getObjects(), before)
    assert.equal(history.length, 1)
  }
})

test('mixed valid and unknown or nested IDs fail before removing any roots', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([rect, { type: 'group', objects: [rect] }])
  canvas.setActiveObject(canvas.getObjects()[0])
  const active = canvas.getActiveObject()
  for (const [id, code] of [['missing', C.OBJECT_NOT_FOUND], [nodes[1].objects[0].id, C.NESTED_OBJECT_UNSUPPORTED]]) {
    await rejectsCode(() => controller.deleteMany([nodes[0].id, id]), code)
    assert.deepEqual(controller.getObjects(), nodes)
    assert.equal(canvas.getActiveObject(), active)
    assert.equal(history.length, 1)
  }
})

test('deleting transformed ActiveSelection roots stores canvas-plane geometry for Undo', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([rect, { ...rect, left: 240 }, formula])
  const original = canvas.getObjects()
  const selection = new ActiveSelection(original.slice(0, 2))
  selection.set({ left: 300, top: 280, angle: 27, scaleX: 1.4, scaleY: 0.7, skewX: 9 })
  selection.setCoords()
  canvas.setActiveObject(selection)
  const before = controller.getObjects()
  const removed = await controller.deleteMany([nodes[1].id, nodes[0].id])
  assert.deepEqual(removed, before.slice(0, 2))
  assert.equal(canvas.getActiveObject(), null)
  restore(canvas, history.at(-1))
  for (let i = 0; i < 2; i++) {
    const after = controller.getObjects()[i]
    for (const key of ['left', 'top', 'angle', 'scaleX', 'scaleY', 'skewX']) {
      assert.ok(Math.abs(after[key] - before[i][key]) < 1e-9, key)
    }
  }
})

for (const failure of ['partial removal', 'history commit']) {
  test(`deleteMany rolls back geometry, z-order and transformed selection after ${failure} failure`, async () => {
    const { controller, canvas, history, rejectHistory } = setup()
    const nodes = await controller.createMany([rect, { ...rect, left: 240 }, formula, rect])
    const original = canvas.getObjects()
    const selection = new ActiveSelection(original.slice(0, 3))
    selection.set({ left: 300, top: 280, angle: 27, scaleX: 1.4, scaleY: 0.7, skewX: 9 })
    selection.setCoords()
    canvas.setActiveObject(selection)
    const before = controller.getObjects()
    const local = original.slice(0, 3).map((object) => ({ left: object.left, top: object.top, angle: object.angle }))
    if (failure === 'history commit') rejectHistory()
    else {
      const remove = canvas.remove.bind(canvas)
      let calls = 0
      canvas.remove = (object) => {
        remove(object)
        if (++calls === 2) throw new Error('removed but event handler failed')
      }
    }
    await rejectsCode(() => controller.deleteMany([nodes[0].id, nodes[1].id, nodes[3].id]), C.COMMIT_FAILED)
    assert.deepEqual(canvas.getObjects(), original)
    assert.equal(canvas.getActiveObject(), selection)
    assert.deepEqual(selection.getObjects(), original.slice(0, 3))
    assert.deepEqual(original.slice(0, 3).map((object) => ({ left: object.left, top: object.top, angle: object.angle })), local)
    assert.deepEqual(controller.getObjects(), before)
    assert.equal(history.length, 1)
    assert.equal(canvas.renderOnAddRemove, true)
  })
}

test('clear and deleteMany enforce readiness and active gesture guards', async () => {
  const { controller } = setup()
  controller._isMutationStable = () => false
  await rejectsCode(() => controller.deleteMany([]), C.COMMIT_FAILED)
  await rejectsCode(() => controller.clear(), C.COMMIT_FAILED)
  controller._getCanvas = () => null
  await rejectsCode(() => controller.deleteMany([]), C.NOT_READY)
  await rejectsCode(() => controller.clear(), C.NOT_READY)
})

for (const operation of ['clear', 'deleteMany']) {
  test(`${operation} restores a selected single root when removal silently fails`, async () => {
    const { controller, canvas, history } = setup()
    const nodes = await controller.createMany([rect, formula])
    const active = canvas.getObjects()[0]
    canvas.setActiveObject(active)
    const remove = canvas.remove.bind(canvas)
    canvas.remove = (object) => { if (object !== canvas.getObjects().at(-1)) remove(object) }
    await rejectsCode(() => operation === 'clear' ? controller.clear() : controller.deleteMany(nodes.map(({ id }) => id)), C.COMMIT_FAILED)
    assert.deepEqual(controller.getObjects(), nodes)
    assert.equal(canvas.getActiveObject(), active)
    assert.equal(history.length, 1)
  })
}

test('deleteMany preserves an unrelated active selection on success', async () => {
  const { controller, canvas } = setup()
  const nodes = await controller.createMany([rect, { ...rect, left: 220 }, formula])
  const selection = new ActiveSelection(canvas.getObjects().slice(0, 2))
  canvas.setActiveObject(selection)
  await controller.deleteMany([nodes[2].id])
  assert.equal(canvas.getActiveObject(), selection)
  assert.deepEqual(canvas.getActiveObjects().map(({ mathboardId }) => mathboardId), nodes.slice(0, 2).map(({ id }) => id))
})
