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
  let fail = false
  let stable = true
  const controller = new BoardController({ getCanvas: () => canvas,
    boardObjectPolicy: new BoardObjectPolicy(),
    buildFormula: async (spec) => new FormulaObject([new Path('M 0 0 L 20 20')], spec),
    pushHistoryCommand: (command) => { if (fail) throw new Error('history failure'); history.push(command) },
    isMutationStable: () => stable,
  })
  return { controller, canvas, history, rejectHistory: () => { fail = true }, unstable: () => { stable = false } }
}
const rect = { type: 'rect', width: 30, height: 20, left: 200, top: 150 }
const formula = { type: 'formula', latex: 'a^2+b^2=c^2', left: 250, top: 220, mathboardInkMode: 'fixed', fill: '#345678' }
const rejectsCode = (operation, code) => assert.rejects(operation, (error) => error.code === code)
function sameMatrix(object, before) {
  object.calcTransformMatrix().forEach((value, index) => assert.ok(Math.abs(value-before[index]) < 1e-8))
}

test('group retains roots in canvas order, fresh composite identity, and one existing history command', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([rect, rect, formula, rect])
  const roots = canvas.getObjects()
  const matrices = roots.map((o) => o.calcTransformMatrix())
  const node = await controller.group([nodes[2].id, nodes[0].id])
  assert.equal(node.type, 'group')
  assert.equal(node.originX, 'left')
  assert.equal(node.originY, 'top')
  assert.ok(!nodes.some((o) => o.id === node.id))
  assert.deepEqual(node.objects.map((o) => o.id), [nodes[0].id, nodes[2].id])
  assert.equal(node.objects[1].type, 'formula')
  assert.equal(node.objects[1].objects, undefined)
  assert.equal(node.objects[1].latex, formula.latex)
  assert.equal(node.objects[1].mathboardInkMode, 'fixed')
  assert.deepEqual(canvas.getObjects(), [roots[1], roots[3], history.at(-1).group])
  sameMatrix(roots[0], matrices[0]); sameMatrix(roots[2], matrices[2])
  assert.equal(history.length, 2)
  const command = history.at(-1)
  assert.equal(command.type, 'group')
  assert.equal(command.index, 2)
  assert.deepEqual(command.members, [{ object: roots[0], index: 0 }, { object: roots[2], index: 2 }])
  assert.equal(canvas.getActiveObject(), null)
  node.objects[0].left = 999
  assert.notEqual(controller.get(node.id).objects[0].left, 999)
})

test('malformed, duplicate, sparse, missing, nested and existing group IDs reject atomically', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([rect, formula, { type: 'group', objects: [rect] }])
  const active = new ActiveSelection(canvas.getObjects().slice(0, 2))
  canvas.setActiveObject(active)
  const before = controller.getObjects()
  for (const ids of [null, undefined, {}, 'id', [], [nodes[0].id], new Array(2), [nodes[0].id, null],
    [nodes[0].id, ' '], [nodes[0].id, nodes[0].id], [nodes[0].id, nodes[2].id]]) {
    await rejectsCode(() => controller.group(ids), C.INVALID_SPEC)
  }
  await rejectsCode(() => controller.group([nodes[0].id, 'missing']), C.OBJECT_NOT_FOUND)
  await rejectsCode(() => controller.group([nodes[0].id, nodes[2].objects[0].id]), C.NESTED_OBJECT_UNSUPPORTED)
  assert.deepEqual(controller.getObjects(), before)
  assert.equal(canvas.getActiveObject(), active)
  assert.equal(history.length, 1)
})

test('transformed partial ActiveSelection dissolves into scene without moving selected and unrelated roots', async () => {
  const { controller, canvas } = setup()
  const nodes = await controller.createMany([rect, formula, { ...rect, left: 400 }])
  const roots = canvas.getObjects()
  const active = new ActiveSelection(roots)
  active.set({ scaleX: 1.8, scaleY: 0.7, angle: 24, left: 350, top: 190, skewX: 12 })
  active.setCoords(); canvas.setActiveObject(active)
  const matrices = roots.map((o) => o.calcTransformMatrix())
  const group = await controller.group([nodes[0].id, nodes[1].id], { select: true })
  roots.forEach((o, i) => sameMatrix(o, matrices[i]))
  assert.equal(canvas.getActiveObject().mathboardId, group.id)
  assert.equal(roots[2].group, undefined)
})

for (const failure of ['history', 'remove', 'insert', 'adopt']) {
  test(`${failure} failure restores root order, exact identities, transforms and selection plane`, async () => {
    const { controller, canvas, history, rejectHistory } = setup()
    const nodes = await controller.createMany([rect, formula, { ...rect, left: 400 }])
    const roots = canvas.getObjects()
    const active = new ActiveSelection(roots)
    active.set({ angle: 20, scaleX: 1.4, skewY: 11, left: 300 })
    active.setCoords(); canvas.setActiveObject(active)
    const before = controller.getObjects()
    const matrices = roots.map((o) => o.calcTransformMatrix())
    const locals = roots.map((o) => [o.left, o.top, o.scaleX, o.scaleY, o.angle])
    if (failure === 'history') rejectHistory()
    else if (failure === 'adopt') {
      let once = true
      roots[0].on('added', () => { if (once) { once = false; throw new Error('injected child adoption failure') } })
    } else {
      const method = failure === 'remove' ? 'remove' : 'insertAt'
      const original = canvas[method].bind(canvas)
      let once = true
      canvas[method] = (...args) => { original(...args); if (once) { once = false; throw new Error('injected failure') } }
    }
    await rejectsCode(() => controller.group([nodes[1].id, nodes[0].id], { select: true }), C.COMMIT_FAILED)
    assert.deepEqual(canvas.getObjects(), roots)
    assert.deepEqual(roots.map((o) => [o.left, o.top, o.scaleX, o.scaleY, o.angle]), locals)
    assert.deepEqual(controller.getObjects(), before)
    assert.equal(canvas.getActiveObject(), active)
    assert.deepEqual(active.getObjects(), roots)
    roots.forEach((o, i) => { sameMatrix(o, matrices[i]); assert.deepEqual([o.left, o.top, o.scaleX, o.scaleY, o.angle], locals[i]) })
    assert.equal(history.length, 1)
    assert.equal(canvas.renderOnAddRemove, true)
  })
}

test('unrelated selection stays active by default; unstable gestures reject grouping', async () => {
  const { controller, canvas, unstable } = setup()
  const nodes = await controller.createMany([rect, rect, formula])
  const unrelated = canvas.getObjects()[2]
  canvas.setActiveObject(unrelated)
  await controller.group([nodes[0].id, nodes[1].id])
  assert.equal(canvas.getActiveObject(), unrelated)
  unstable()
  await rejectsCode(() => controller.group(['a', 'b']), C.COMMIT_FAILED)
})
