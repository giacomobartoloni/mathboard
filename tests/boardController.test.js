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
import { BoardController, BOARD_CONTROLLER_ERROR_CODES as C } from '../src/board/BoardController.js'

installFabricDomStub()

function setup(overrides = {}) {
  const canvas = makeControllerCanvas()
  const history = []
  const controller = new BoardController({
    getCanvas: () => canvas,
    boardObjectPolicy: new BoardObjectPolicy(),
    buildFormula: async (spec) => new FormulaObject([new Path('M 0 0 L 20 20')], { ...spec, latex: spec.latex }),
    pushHistoryCommand: (command) => history.push(command),
    ...overrides,
  })
  return { canvas, history, controller }
}
const rect = { type: 'rect', left: 100, top: 150, width: 50, height: 40 }
const formula = { type: 'formula', latex: 'x=1', left: 200, top: 150, scaleX: 1.5, angle: 20, opacity: 0.4 }
const rejectsCode = (operation, code) => assert.rejects(operation, (error) => error.code === code)

test('create returns detached semantic nodes with fresh recursive IDs and one add command', async () => {
  const { controller, canvas, history } = setup()
  const node = await controller.create({ type: 'group', id: 'old-root', objects: [{ ...rect, id: 'old-child' }] })
  assert.equal(node.type, 'group')
  assert.match(node.id, /^mbobj_/)
  assert.match(node.objects[0].id, /^mbobj_/)
  assert.notEqual(node.objects[0].id, node.id)
  assert.equal(canvas.getObjects().length, 1)
  assert.equal(history.length, 1)
  assert.equal(history[0].type, 'add')
  assert.equal(history[0].index, 0)
  assert.equal(canvas.getActiveObject(), null)
  assert.doesNotThrow(() => JSON.stringify(node))
})

test('create supports every semantic primitive and Formula stays atomic', async () => {
  const { controller } = setup()
  for (const spec of [rect, { type: 'circle', radius: 20 }, { type: 'line', x1: 0, y1: 1, x2: 5, y2: 6 },
    { type: 'path', path: [['M', 0, 0], ['L', 20, 20]] }, { type: 'text', text: 'hello' }, formula]) {
    const node = await controller.create(spec)
    assert.equal(node.type, spec.type)
    assert.match(node.id, /^mbobj_/)
    if (spec.type === 'formula') {
      assert.equal(node.latex, 'x=1')
      assert.equal(node.objects, undefined)
      assert.equal(node.mathboardRenderedInkIsLight, undefined)
    }
  }
})

test('creation rejects invalid recursive specs before changing the canvas', async () => {
  const { controller, canvas, history } = setup()
  for (const spec of [null, [], { type: 'ActiveSelection' }, { ...rect, left: Infinity },
    { type: 'text', text: 7 }, { type: 'formula', latex: ' ' }, { type: 'path', path: 'bad' },
    { type: 'line', x1: 0, y1: 0, x2: NaN, y2: 1 }, { type: 'group', objects: [null] }]) {
    await rejectsCode(() => controller.create(spec), C.INVALID_SPEC)
  }
  assert.equal(canvas.getObjects().length, 0)
  assert.equal(history.length, 0)
})

test('createMany commits independent objects in order with one batch history entry', async () => {
  const { controller, canvas, history } = setup()
  await controller.create(rect)
  const nodes = await controller.createMany([rect, { type: 'text', text: 'title' }, formula])
  assert.deepEqual(nodes.map((n) => n.type), ['rect', 'text', 'formula'])
  assert.equal(new Set(nodes.map((n) => n.id)).size, 3)
  assert.equal(canvas.getObjects().length, 4)
  assert.equal(history.length, 2)
  assert.equal(history[1].type, 'batch-add')
  assert.deepEqual(history[1].entries.map((e) => e.index), [1, 2, 3])
})

test('Formula render failure leaves single and batch creation unchanged', async () => {
  for (const buildFormula of [async () => null, async () => { throw new Error('bad TeX') }]) {
    const { controller, canvas, history } = setup({ buildFormula })
    await rejectsCode(() => controller.create(formula), C.FORMULA_RENDER_FAILED)
    await rejectsCode(() => controller.createMany([rect, formula, { type: 'text', text: 'end' }]), C.FORMULA_RENDER_FAILED)
    assert.equal(canvas.getObjects().length, 0)
    assert.equal(history.length, 0)
  }
})

test('partial batch insertion and history failure roll back canvas contents', async () => {
  for (const historyFailure of [false, true]) {
    const { canvas, controller, history } = setup(historyFailure ? {
      pushHistoryCommand: () => { throw new Error('history failed') },
    } : {})
    if (!historyFailure) {
      const insert = canvas.insertAt
      canvas.insertAt = (index, object) => {
        insert(index, object)
        if (index === 1) throw new Error('insert failed after insertion')
      }
    }
    await rejectsCode(() => controller.createMany([rect, rect]), C.COMMIT_FAILED)
    assert.equal(canvas.getObjects().length, 0)
    assert.equal(history.length, 0)
    assert.equal(canvas.renderOnAddRemove, true)
  }
})

test('get traverses Group children while mutation rejects nested IDs', async () => {
  const { controller, history } = setup()
  const group = await controller.create({ type: 'group', objects: [rect] })
  const child = group.objects[0]
  assert.equal(controller.get(child.id).type, 'rect')
  assert.equal(controller.get('missing'), null)
  await rejectsCode(() => controller.update(child.id, { left: 2 }), C.NESTED_OBJECT_UNSUPPORTED)
  await rejectsCode(() => controller.delete(child.id), C.NESTED_OBJECT_UNSUPPORTED)
  await rejectsCode(() => controller.update('missing', { left: 2 }), C.OBJECT_NOT_FOUND)
  await rejectsCode(() => controller.delete('missing'), C.OBJECT_NOT_FOUND)
  assert.equal(history.length, 1)
})

test('getObjects returns detached path arrays in z-order', async () => {
  const { controller, canvas } = setup()
  const nodes = await controller.createMany([{ type: 'path', path: [['M', 0, 0], ['L', 20, 20]] }, rect])
  const observed = controller.getObjects()
  observed[0].path[1][1] = 999
  assert.equal(canvas.getObjects()[0].path[1][1], 20)
  assert.deepEqual(controller.getObjects().map((n) => n.id), nodes.map((n) => n.id))
})

test('transform and text updates preserve identity and produce undoable modify snapshots', async () => {
  const { controller, canvas, history } = setup()
  const text = await controller.create({ type: 'text', text: 'before', left: 20 })
  const updated = await controller.update(text.id, { text: 'after', left: 80 })
  assert.equal(updated.id, text.id)
  assert.equal(updated.text, 'after')
  assert.equal(updated.left, 80)
  const command = history.at(-1)
  assert.equal(command.type, 'modify')
  assert.equal(history.length, 2)
  applySnapshot(canvas.getObjects()[0], command.entries[0].before)
  assert.equal(controller.get(text.id).text, 'before')
  assert.equal(controller.get(text.id).left, 20)
  applySnapshot(canvas.getObjects()[0], command.entries[0].after)
  await controller.update(text.id, { text: 'after', left: 80 })
  assert.equal(history.length, 2)
})

test('patch allowlist rejects styles, identity, wrong types, and nonfinite values', async () => {
  const { controller, history } = setup()
  const node = await controller.create(rect)
  for (const patch of [{ fill: 'red' }, { id: 'other' }, { text: 'bad' }, { left: NaN },
    { flipX: 1 }, { originX: 'bad' }, { latex: 'x' }, null, []]) {
    await rejectsCode(() => controller.update(node.id, patch), C.INVALID_PATCH)
  }
  assert.equal(controller.get(node.id).left, 100)
  assert.equal(history.length, 1)
})

test('Formula update replaces at the same index and preserves identity and presentation', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([rect, formula, rect])
  const before = canvas.getObjects()[1]
  canvas.setActiveObject(before)
  const updated = await controller.update(nodes[1].id, { latex: 'x=2' })
  assert.equal(updated.id, nodes[1].id)
  assert.equal(updated.latex, 'x=2')
  assert.equal(updated.left, 200)
  assert.equal(updated.scaleX, 1.5)
  assert.equal(updated.angle, 20)
  assert.equal(updated.opacity, 0.4)
  assert.notEqual(canvas.getObjects()[1], before)
  assert.equal(canvas.getActiveObject(), canvas.getObjects()[1])
  assert.equal(history.at(-1).type, 'replace')
  assert.equal(history.at(-1).index, 1)
})

test('failed Formula rerender leaves the original runtime and history untouched', async () => {
  let fail = false
  const { controller, canvas, history } = setup({
    buildFormula: async (spec) => fail ? null : new FormulaObject([new Path('M 0 0 L 20 20')], { ...spec, latex: spec.latex }),
  })
  const node = await controller.create(formula)
  const original = canvas.getObjects()[0]
  fail = true
  await rejectsCode(() => controller.update(node.id, { latex: 'bad' }), C.FORMULA_RENDER_FAILED)
  assert.equal(canvas.getObjects()[0], original)
  assert.equal(history.length, 1)
})

test('update and delete roll back when history rejects the commit', async () => {
  let fail = false
  const history = []
  const { controller, canvas } = setup({ pushHistoryCommand: (command) => {
    if (fail) throw new Error('history failure')
    history.push(command)
  } })
  const node = await controller.create(rect)
  fail = true
  await rejectsCode(() => controller.update(node.id, { left: 500 }), C.COMMIT_FAILED)
  assert.equal(controller.get(node.id).left, 100)
  await rejectsCode(() => controller.delete(node.id), C.COMMIT_FAILED)
  assert.equal(canvas.getObjects().length, 1)
  assert.equal(history.length, 1)
})

test('delete returns the semantic object and retains its original history index', async () => {
  const { controller, canvas, history } = setup()
  const nodes = await controller.createMany([rect, formula])
  const removed = await controller.delete(nodes[0].id)
  assert.equal(removed.id, nodes[0].id)
  assert.deepEqual(controller.getObjects().map((n) => n.id), [nodes[1].id])
  const command = history.at(-1)
  assert.equal(command.type, 'delete')
  assert.equal(command.entries[0].index, 0)
  canvas.insertAt(0, command.entries[0].object)
  assert.equal(controller.getObjects()[0].id, nodes[0].id)
})

test('updating an ActiveSelection member uses canvas-plane coordinates', async () => {
  const { controller, canvas } = setup()
  const nodes = await controller.createMany([rect, { ...rect, left: 200 }])
  const members = canvas.getObjects()
  const selection = new ActiveSelection(members)
  selection.set({ left: selection.left + 60, top: selection.top + 40 })
  selection.setCoords()
  canvas.setActiveObject(selection)
  assert.equal(controller.get(nodes[0].id).left, 160)
  const updated = await controller.update(nodes[0].id, { left: 300 })
  assert.equal(updated.left, 300)
  assert.equal(updated.top, 190)
  assert.equal(controller.get(nodes[1].id).left, 260)
  assert.equal(canvas.getActiveObject(), null)
})

test('missing canvas rejects every public operation with the readiness code', async () => {
  const { controller } = setup({ getCanvas: () => null })
  for (const call of [() => controller.create(rect), () => controller.createMany([rect]),
    () => controller.update('id', {}), () => controller.delete('id')]) {
    await rejectsCode(call, C.NOT_READY)
  }
  for (const call of [() => controller.get('id'), () => controller.getObjects(), () => controller.observe()]) {
    assert.throws(call, (error) => error.code === C.NOT_READY)
  }
})

test('async creation rejects a changed canvas before inserting any runtime objects', async () => {
  let finish
  let current = makeControllerCanvas()
  const original = current
  const history = []
  const { controller } = setup({
    getCanvas: () => current,
    pushHistoryCommand: (command) => history.push(command),
    buildFormula: () => new Promise((resolve) => { finish = resolve }),
  })
  const pending = controller.create(formula)
  current = makeControllerCanvas()
  finish(new FormulaObject([new Path('M 0 0 L 20 20')], { latex: 'x=1' }))
  await rejectsCode(() => pending, C.NOT_READY)
  assert.equal(original.getObjects().length, 0)
  assert.equal(current.getObjects().length, 0)
  assert.equal(history.length, 0)
})

test('async Formula update rejects a removed target without resurrecting it', async () => {
  let finish
  let delay = false
  const { controller, canvas, history } = setup({
    buildFormula: async (spec) => {
      if (delay) await new Promise((resolve) => { finish = resolve })
      return new FormulaObject([new Path('M 0 0 L 20 20')], { ...spec, latex: spec.latex })
    },
  })
  const node = await controller.create(formula)
  delay = true
  const pending = controller.update(node.id, { latex: 'x=2' })
  canvas.remove(canvas.getObjects()[0])
  finish()
  await rejectsCode(() => pending, C.COMMIT_FAILED)
  assert.equal(canvas.getObjects().length, 0)
  assert.equal(history.length, 1)
})

test('async Formula update keeps a human transform made during rendering', async () => {
  let finish
  let delay = false
  const { controller, canvas } = setup({
    buildFormula: async (spec) => {
      if (delay) await new Promise((resolve) => { finish = resolve })
      return new FormulaObject([new Path('M 0 0 L 20 20')], { ...spec, latex: spec.latex })
    },
  })
  const node = await controller.create(formula)
  delay = true
  const pending = controller.update(node.id, { latex: 'x=2' })
  canvas.getObjects()[0].set({ left: 400, angle: 45 })
  finish()
  const result = await pending
  assert.equal(result.left, 400)
  assert.equal(result.angle, 45)
})

test('programmable mutations reject live text editing without corrupting its history', async () => {
  const { controller, canvas, history } = setup()
  const node = await controller.create({ type: 'text', text: 'before' })
  const text = canvas.getObjects()[0]
  canvas.setActiveObject(text)
  text.set('text', 'typed')
  text.isEditing = true
  for (const operation of [() => controller.update(node.id, { text: 'programmatic' }),
    () => controller.delete(node.id), () => controller.create(rect), () => controller.createMany([rect])]) {
    await rejectsCode(operation, C.COMMIT_FAILED)
  }
  assert.equal(text.text, 'typed')
  assert.equal(text.isEditing, true)
  assert.equal(history.length, 1)
  assert.equal(canvas.getObjects().length, 1)
})


test('batch rollback cleans every inserted object even when removal listeners throw', async () => {
  const { controller, canvas, history } = setup()
  const insert = canvas.insertAt
  const remove = canvas.remove
  canvas.insertAt = (index, object) => {
    insert(index, object)
    if (index === 1) throw new Error('insertion listener failed')
  }
  canvas.remove = (object) => {
    remove(object)
    throw new Error('removal listener failed')
  }
  await rejectsCode(() => controller.createMany([rect, rect]), C.COMMIT_FAILED)
  assert.equal(canvas.getObjects().length, 0)
  assert.equal(history.length, 0)
  assert.equal(canvas.renderOnAddRemove, true)
})

test('unstable gesture rejects every mutation and marks observations transient', async () => {
  let stable = true
  const { controller, canvas, history } = setup({ isMutationStable: () => stable })
  const node = await controller.create(rect)
  stable = false
  for (const operation of [() => controller.create(rect), () => controller.createMany([rect]),
    () => controller.update(node.id, { left: 400 }), () => controller.delete(node.id)]) {
    await rejectsCode(operation, C.COMMIT_FAILED)
  }
  assert.equal(canvas.getObjects().length, 1)
  assert.equal(canvas.getObjects()[0].left, 100)
  assert.equal(history.length, 1)
  assert.equal(controller.observe().stable, false)
  stable = true
  assert.equal(controller.observe().stable, true)
})

test('async Formula replacement rechecks stability before touching live selection', async () => {
  let stable = true
  let release
  const { controller, canvas, history } = setup({ isMutationStable: () => stable })
  const node = await controller.create(formula)
  const original = canvas.getObjects()[0]
  await controller.create(rect)
  const selection = new ActiveSelection(canvas.getObjects())
  canvas.setActiveObject(selection)
  controller._buildFormula = () => new Promise((resolve) => { release = resolve })
  const pending = controller.update(node.id, { latex: 'x=2' })
  stable = false
  release(new FormulaObject([new Path('M 0 0 L 20 20')], { latex: 'x=2' }))
  await rejectsCode(() => pending, C.COMMIT_FAILED)
  assert.equal(canvas.getObjects()[0], original)
  assert.equal(canvas.getActiveObject(), selection)
  assert.equal(history.length, 2)
})

test('afterMutation failure preserves successful committed response', async (t) => {
  const logged = t.mock.method(console, 'error', () => {})
  const { controller, canvas, history } = setup({ afterMutation: () => { throw new Error('refresh failed') } })
  const node = await controller.create(rect)
  assert.equal(canvas.getObjects()[0].mathboardId, node.id)
  assert.equal(history.length, 1)
  assert.equal(logged.mock.callCount(), 1)
})

test('strict create validation normalizes unknown fields, invalid styles and uncloneable values', async () => {
  const { controller, canvas, history } = setup()
  for (const spec of [{ ...rect, unexpected: 1 }, { ...rect, callback: () => {} },
    { ...rect, fill: {} }, { ...rect, strokeDashArray: [Infinity] }, { ...rect, opacity: NaN },
    { ...rect, mathboardInkMode: 'other' }, { type: 'group', objects: [{ ...rect, callback: () => {} }] },
    { ...rect, id: () => {} }]) {
    await rejectsCode(() => controller.create(spec), C.INVALID_SPEC)
  }
  assert.equal(canvas.getObjects().length, 0)
  assert.equal(history.length, 0)
})

test('async batch creation rejects a gesture started during materialization', async () => {
  let stable = true
  let release
  const { controller, canvas, history } = setup({ isMutationStable: () => stable,
    buildFormula: () => new Promise((resolve) => { release = resolve }) })
  const pending = controller.createMany([rect, formula])
  await Promise.resolve()
  stable = false
  release(new FormulaObject([new Path('M 0 0 L 20 20')], { latex: 'x=1' }))
  await rejectsCode(() => pending, C.COMMIT_FAILED)
  assert.equal(canvas.getObjects().length, 0)
  assert.equal(history.length, 0)
})
