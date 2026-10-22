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
import { Rect, Circle, Group, ActiveSelection } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardHistory } from '../src/history/BoardHistory.js'
import { snapshotObject } from '../src/history/commandLog.js'

installFabricDomStub()

const rect = (left = 10) => new Rect({ left, top: 20, width: 60, height: 40, stroke: '#111111' })
function setup(objects = []) {
  const canvas = makeControllerCanvas(objects)
  let notifications = 0
  let fail = false
  let inkSyncs = 0
  const history = new BoardHistory({
    getCanvas: () => canvas,
    onDocumentChanged: () => { notifications++; if (fail) throw new Error('notify failed') },
    syncAutoInk: () => { inkSyncs++ },
  })
  return { canvas, history, get notifications() { return notifications },
    get inkSyncs() { return inkSyncs }, failNext: () => { fail = true }, recover: () => { fail = false } }
}

test('history retains Fabric identities and z-order across add, delete, replace and batch-add', () => {
  const a = rect(), b = rect(100), c = rect(200)
  const { canvas, history } = setup([a, b])
  history.record({ type: 'add', object: b, index: 1 })
  assert.equal(history.undo().type, 'add')
  assert.deepEqual(canvas.getObjects(), [a])
  assert.equal(history.redo().type, 'add')
  assert.deepEqual(canvas.getObjects(), [a, b])

  canvas.remove(a)
  history.record({ type: 'delete', entries: [{ object: a, index: 0 }] })
  history.undo()
  assert.deepEqual(canvas.getObjects(), [a, b])
  history.redo()
  assert.deepEqual(canvas.getObjects(), [b])

  canvas.remove(b)
  canvas.insertAt(0, c)
  history.record({ type: 'replace', removed: b, added: c, index: 0 })
  history.undo()
  assert.deepEqual(canvas.getObjects(), [b])
  history.redo()
  assert.deepEqual(canvas.getObjects(), [c])

  canvas.insertAt(1, a)
  canvas.insertAt(2, b)
  history.record({ type: 'batch-add', entries: [{ object: a, index: 1 }, { object: b, index: 2 }] })
  history.undo()
  assert.deepEqual(canvas.getObjects(), [c])
  history.redo()
  assert.deepEqual(canvas.getObjects(), [c, a, b])
})

test('group and ungroup replay restores the exact members in canvas order', () => {
  const a = rect(), b = new Circle({ left: 100, top: 40, radius: 20 }), other = rect(300)
  const { canvas, history } = setup([a, b, other])
  const members = [{ object: a, index: 0 }, { object: b, index: 1 }]
  canvas.remove(a); canvas.remove(b)
  const group = new Group([a, b])
  canvas.insertAt(0, group)
  history.record({ type: 'group', group, index: 0, members })
  history.undo()
  assert.deepEqual(canvas.getObjects(), [a, b, other])
  history.redo()
  assert.deepEqual(canvas.getObjects(), [group, other])
  assert.deepEqual(group.getObjects(), [a, b])

  group.removeAll()
  canvas.remove(group)
  canvas.insertAt(0, a); canvas.insertAt(1, b)
  history.record({ type: 'ungroup', group, index: 0, members })
  history.undo()
  assert.deepEqual(canvas.getObjects(), [group, other])
  history.redo()
  assert.deepEqual(canvas.getObjects(), [a, b, other])
})

test('modify replay preserves scene-plane snapshots for transformed ActiveSelection members', () => {
  const a = rect(30), b = rect(150)
  const { canvas, history } = setup([a, b])
  const selection = new ActiveSelection([a, b])
  canvas.setActiveObject(selection)
  const before = [a, b].map((object) => ({ object, before: snapshotObject(object) }))
  selection.set({ left: 280, top: 200, scaleX: 1.3, scaleY: 0.8, angle: 18 })
  selection.setCoords()
  const entries = before.map(({ object, before: old }) => ({ object, before: old, after: snapshotObject(object) }))
  history.record({ type: 'modify', entries })
  history.undo()
  assert.deepEqual(canvas.getObjects(), [a, b])
  for (const { object, before: old } of entries) {
    assert.ok(Math.abs(object.left - old.left) < 0.01)
    assert.ok(Math.abs(object.top - old.top) < 0.01)
  }
  history.redo()
  for (const { object, after } of entries) {
    assert.ok(Math.abs(object.left - after.left) < 0.01)
    assert.ok(Math.abs(object.top - after.top) < 0.01)
  }
})

test('recolor coalescing preserves the first before and atomically rolls back notification failure', () => {
  const a = rect()
  const ctx = setup([a])
  const { history } = ctx
  const before = { stroke: '#111111' }
  a.set({ stroke: '#222222' })
  history.record({ type: 'recolor', entries: [{ object: a, before, after: { stroke: '#222222' } }] }, { coalesce: true })
  assert.equal(ctx.notifications, 1)
  a.set({ stroke: '#333333' })
  history.record({ type: 'recolor', entries: [{ object: a, before: { stroke: '#222222' }, after: { stroke: '#333333' } }] }, { coalesce: true })
  assert.equal(history.summary().length, 1)
  history.undo()
  assert.equal(a.stroke, '#111111')
  history.redo()
  assert.equal(a.stroke, '#333333')

  a.set({ stroke: '#444444' })
  ctx.failNext()
  assert.throws(() => history.record(
    { type: 'recolor', entries: [{ object: a, before: { stroke: '#333333' }, after: { stroke: '#444444' } }] },
    { coalesce: true },
  ), /notify failed/)
  // DrawBoard is responsible for restoring the direct UI mutation's paint.
  a.set({ stroke: '#333333' })
  assert.deepEqual(history.summary(), { length: 1, step: 0, tipType: 'recolor' })
  ctx.recover()
  history.undo()
  assert.equal(a.stroke, '#111111')
  history.redo()
  assert.equal(a.stroke, '#333333')
  assert.equal(ctx.notifications, 3)
})

test('new gesture drops Redo and a 51st record retains exactly 50 commands', () => {
  const { history } = setup()
  for (let i = 0; i < 51; i++) history.record({ type: 'add', object: rect(i), index: i })
  assert.deepEqual(history.summary(), { length: 50, step: 49, tipType: 'add' })
  history.undo()
  assert.deepEqual(history.summary(), { length: 50, step: 48, tipType: 'add' })
  history.record({ type: 'delete', entries: [] })
  assert.deepEqual(history.summary(), { length: 50, step: 49, tipType: 'delete' })
  assert.equal(history.redo(), null)
})

test('suspension is nested and restored on error; summary is detached; reset clears commands', () => {
  const ctx = setup()
  const { history } = ctx
  assert.throws(() => history.runSuspended(() => {
    assert.equal(history.isSuspended(), true)
    history.runSuspended(() => assert.equal(history.record({ type: 'add', object: rect(), index: 0 }), false))
    throw new Error('test error')
  }), /test error/)
  assert.equal(history.isSuspended(), false)
  const output = history.summary()
  output.step = 999
  assert.equal(history.summary().step, -1)
  history.record({ type: 'add', object: rect(), index: 0 })
  history.reset()
  assert.deepEqual(history.summary(), { length: 0, step: -1, tipType: null })
  assert.equal(ctx.notifications, 1)
})
