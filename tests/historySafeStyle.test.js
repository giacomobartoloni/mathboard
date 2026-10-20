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
import { applySnapshot } from '../src/history/commandLog.js'
import { BoardController, BOARD_CONTROLLER_ERROR_CODES as C } from '../src/board/BoardController.js'

installFabricDomStub()

function setup(overrides = {}) {
  const canvas = makeControllerCanvas()
  const history = []
  const controller = new BoardController({ getCanvas: () => canvas, boardObjectPolicy: new BoardObjectPolicy(),
    buildFormula: async (spec) => {
      const color = spec.mathboardInkMode === 'fixed' ? spec.fill || spec.stroke : '#000000'
      const object = new FormulaObject([new Path('M 0 0 L 20 20', { fill: '#000000' })], spec)
      object.applyInk(color)
      object.set('fill', color)
      return object
    },
    pushHistoryCommand: (command) => history.push(command), isMutationStable: () => true, ...overrides })
  return { controller, canvas, history }
}
const rect = { type: 'rect', left: 100, top: 120, width: 50, height: 40 }
const formula = { type: 'formula', latex: 'x=1', left: 230, top: 180, fill: '#1864ab', mathboardInkMode: 'fixed' }
const style = { stroke: '#c92a2a', fill: null, opacity: 0.4, strokeWidth: 5, strokeDashArray: [9, 4],
  strokeLineCap: 'round', strokeLineJoin: 'bevel' }
const rejectsPatch = (fn) => assert.rejects(fn, (error) => error.code === C.INVALID_PATCH)

for (const spec of [rect, { type: 'circle', radius: 30 }, { type: 'line', x1: 0, y1: 0, x2: 30, y2: 40 },
  { type: 'path', path: [['M', 0, 0], ['L', 20, 30]] }, { type: 'text', text: 'Before' }]) {
  test(`${spec.type} style patch infers fixed ink and restores all fields through retained modify snapshots`, async () => {
    const { controller, canvas, history } = setup()
    const node = await controller.create(spec)
    const object = canvas.getObjects()[0]
    const before = controller.get(node.id)
    const patch = structuredClone(style)
    if (spec.type === 'text') patch.text = 'After'
    const updated = await controller.update(node.id, patch)
    for (const [key, value] of Object.entries(patch)) assert.deepEqual(updated[key], value)
    assert.equal(updated.mathboardInkMode, 'fixed')
    patch.strokeDashArray[0] = 999
    assert.deepEqual(object.strokeDashArray, [9, 4])
    assert.equal(history.length, 2)
    assert.equal(history.at(-1).type, 'modify')
    applySnapshot(object, history.at(-1).entries[0].before)
    assert.deepEqual(controller.get(node.id), before)
    applySnapshot(object, history.at(-1).entries[0].after)
    assert.deepEqual(object.strokeDashArray, [9, 4])
    assert.equal(object.fill, null)
    assert.equal(object.opacity, 0.4)
    assert.equal(object.mathboardInkMode, 'fixed')
    await controller.update(node.id, structuredClone(style))
    assert.equal(history.length, 2)
  })
}

test('invalid primitive styles reject the whole patch without changing paint or history', async () => {
  const { controller, history } = setup()
  const node = await controller.create(rect)
  for (const patch of [{ stroke: {} }, { fill: 9 }, { opacity: -0.1 }, { opacity: 1.1 }, { strokeWidth: -1 },
    { strokeWidth: Infinity }, { strokeDashArray: [-1] }, { strokeDashArray: [NaN] }, { strokeDashArray: new Array(1) },
    { strokeDashArray: '9,4' }, { strokeLineCap: 'flat' }, { strokeLineJoin: 'sharp' }, { mathboardInkMode: 'other' },
    { fill: '#f00', arbitrary: true }, { fill: '#f00', width: 50 }]) {
    await rejectsPatch(() => controller.update(node.id, patch))
    assert.deepEqual(controller.get(node.id), node)
    assert.equal(history.length, 1)
  }
})

test('Group opacity is undoable but paint and recursive ink mode patches are rejected', async () => {
  const { controller, canvas, history } = setup()
  const node = await controller.create({ type: 'group', objects: [rect, formula] })
  const updated = await controller.update(node.id, { opacity: 0.3, left: 400 })
  assert.equal(updated.opacity, 0.3)
  assert.deepEqual(updated.objects, node.objects)
  applySnapshot(canvas.getObjects()[0], history.at(-1).entries[0].before)
  assert.deepEqual(controller.get(node.id), node)
  for (const patch of [{ fill: 'red' }, { stroke: null }, { mathboardInkMode: 'fixed' }, { strokeWidth: 1 }]) {
    await rejectsPatch(() => controller.update(node.id, patch))
  }
})

test('primitive history failure restores every accepted style and visible paint', async () => {
  let fail = false
  const { controller, canvas } = setup({ pushHistoryCommand: () => { if (fail) throw new Error('history unavailable') } })
  const node = await controller.create({ ...rect, stroke: '#1864ab', fill: '#fff', mathboardInkMode: 'fixed', strokeDashArray: [2, 3] })
  fail = true
  await assert.rejects(() => controller.update(node.id, { ...style, fill: '#ff0' }), (error) => error.code === C.COMMIT_FAILED)
  assert.deepEqual(controller.get(node.id), node)
  assert.deepEqual(canvas.getObjects()[0].strokeDashArray, [2, 3])
})

test('style patch of transformed selection member uses scene coordinates', async () => {
  const { controller, canvas } = setup()
  const nodes = await controller.createMany([rect, { ...rect, left: 300 }])
  const selection = new ActiveSelection(canvas.getObjects())
  selection.set({ left: selection.left + 70, angle: 27, scaleX: 1.2 })
  canvas.setActiveObject(selection)
  const before = controller.getObjects()
  const updated = await controller.update(nodes[0].id, { ...style, left: 500 })
  assert.equal(updated.left, 500)
  assert.ok(Math.abs(updated.top - before[0].top) < 1e-9)
  assert.ok(Math.abs(controller.get(nodes[1].id).left - before[1].left) < 1e-9)
})

test('formula stroke-only patch overrides previous fill and keeps one canonical semantic ink', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([rect, formula, rect])
  const old = canvas.getObjects()[1]
  const updated = await controller.update(nodes[1].id, { stroke: '#c92a2a' })
  assert.equal(updated.fill, '#c92a2a')
  assert.equal(updated.mathboardInkMode, 'fixed')
  assert.equal(updated.id, nodes[1].id)
  assert.equal(updated.latex, 'x=1')
  assert.equal(history.length, 2)
  assert.equal(history.at(-1).type, 'replace')
  assert.equal(history.at(-1).removed, old)
  assert.equal(history.at(-1).index, 1)
  assert.equal(canvas.getObjects()[1].getObjects()[0].fill, '#c92a2a')
  await controller.update(updated.id, { fill: '#c92a2a' })
  assert.equal(history.length, 2)
})

test('formula mixed latex, paint, opacity and transform produces one retained replacement', async () => {
  const { controller, canvas, history } = setup()
  const node = await controller.create(formula)
  const updated = await controller.update(node.id, { latex: 'x=2', fill: '#2f9e44', stroke: '#f00', opacity: 0.6, left: 450 })
  assert.equal(updated.fill, '#2f9e44')
  assert.equal(updated.latex, 'x=2')
  assert.equal(updated.opacity, 0.6)
  assert.equal(updated.left, 450)
  assert.equal(history.length, 2)
  assert.equal(history.at(-1).type, 'replace')
  assert.equal(canvas.getObjects()[0].getObjects()[0].fill, '#2f9e44')
  await controller.update(node.id, { opacity: 0.5 })
  assert.equal(history.at(-1).type, 'modify')
  applySnapshot(canvas.getObjects()[0], history.at(-1).entries[0].before)
  assert.equal(controller.get(node.id).opacity, 0.6)
})

test('formula rejects absent paint and unsupported stroke styles', async () => {
  const { controller, history } = setup()
  const node = await controller.create(formula)
  for (const patch of [{ fill: null }, { stroke: null }, { fill: '' }, { fill: '  ' }, { fill: 'none' },
    { stroke: 'transparent' }, { strokeWidth: 3 }, { strokeDashArray: [2, 3] }, { strokeLineCap: 'round' }, { strokeLineJoin: 'bevel' }]) {
    await rejectsPatch(() => controller.update(node.id, patch))
    assert.deepEqual(controller.get(node.id), node)
    assert.equal(history.length, 1)
  }
})

test('formula failed paint rerender preserves the original instance and paint', async () => {
  const { controller, canvas } = setup()
  const node = await controller.create(formula)
  const object = canvas.getObjects()[0]
  controller._buildFormula = async () => null
  await assert.rejects(() => controller.update(node.id, { fill: '#f00' }), (error) => error.code === C.FORMULA_RENDER_FAILED)
  assert.equal(canvas.getObjects()[0], object)
  assert.deepEqual(controller.get(node.id), node)
})

test('primitive patches support every cap and join, zero opacity/width and dash removal', async () => {
  const { controller } = setup()
  const node = await controller.create(rect)
  for (const strokeLineCap of ['butt', 'round', 'square']) {
    for (const strokeLineJoin of ['bevel', 'round', 'miter']) {
      const updated = await controller.update(node.id, { strokeLineCap, strokeLineJoin, opacity: 0, strokeWidth: 0, strokeDashArray: null })
      assert.equal(updated.strokeLineCap, strokeLineCap)
      assert.equal(updated.strokeLineJoin, strokeLineJoin)
      assert.equal(updated.opacity, 0)
      assert.equal(updated.strokeWidth, 0)
      assert.equal(updated.strokeDashArray, null)
    }
  }
})
