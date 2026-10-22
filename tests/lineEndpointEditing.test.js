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
import { Line, Point, util } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { lineGeometryAdapter } from '../src/board/geometry/lineGeometryAdapter.js'
import { snapPointToAngle } from '../src/board/geometry/angleConstraints.js'
import { geometryControls, isGeometryHandleTransform } from '../src/board/geometry/geometryHandles.js'
import { snapshotObject, applySnapshot, snapshotsEqual } from '../src/history/commandLog.js'
import { serializeBoardDocument } from '../src/board/persistence/serializeBoardDocument.js'
import { materializeBoardDocument } from '../src/board/persistence/materializeBoardDocument.js'
import { stampDocumentFromObjects } from '../src/stamps/serialize.js'
import { materializeStampDocument } from '../src/stamps/materialize.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'

installFabricDomStub()

const EPSILON = 1e-6
const near = (actual, expected) => {
  assert.ok(Math.abs(actual.x - expected.x) < EPSILON, `x: ${actual.x} vs ${expected.x}`)
  assert.ok(Math.abs(actual.y - expected.y) < EPSILON, `y: ${actual.y} vs ${expected.y}`)
}
const at = (line, id) => lineGeometryAdapter.readHandle(line, id)
const line = (x1, y1, x2, y2, options = {}) => new Line([x1, y1, x2, y2], {
  originX: 'left', originY: 'top', stroke: '#1565c0', strokeWidth: 3, ...options,
})

test('line endpoint adapter leaves the opposite endpoint anchored after transformed drags', () => {
  for (const points of [
    [10, 20, 120, 80], [120, 80, 10, 20], [30, 20, 30, 100],
    [10, 70, 100, 70], [30, 30, 30, 30],
  ]) {
    for (const transformed of [{}, { angle: 37, scaleX: 1.4, scaleY: 0.65, skewX: 15 },
      { angle: -135, flipX: true, flipY: true, scaleX: 0.8 },
      { originX: 'center', originY: 'center', angle: 85 }]) {
      const obj = line(...points, { left: 250, top: 185, ...transformed })
      const fixed = at(obj, 'end')
      const target = at(obj, 'start').add(new Point(42, -17))
      assert.equal(lineGeometryAdapter.moveHandle(obj, 'start', target), true)
      near(at(obj, 'end'), fixed)
      near(at(obj, 'start'), target)
      const fixedStart = at(obj, 'start')
      const targetEnd = at(obj, 'end').add(new Point(-19, 51))
      assert.equal(lineGeometryAdapter.moveHandle(obj, 'end', targetEnd), true)
      near(at(obj, 'start'), fixedStart)
      near(at(obj, 'end'), targetEnd)
    }
  }
})

test('geometry snapshots restore endpoints, transforms and style; normal history snapshots remain unchanged', () => {
  const obj = line(25, 35, 145, 95, { angle: 22, scaleX: 1.3 })
  const before = snapshotObject(obj, { includeGeometry: true })
  assert.ok(Object.hasOwn(before, 'x1'))
  assert.equal(Object.hasOwn(snapshotObject(obj), 'x1'), false)
  const fixed = at(obj, 'end')
  const proposed = at(obj, 'start').add(new Point(-45, 36))
  lineGeometryAdapter.moveHandle(obj, 'start', proposed)
  const after = snapshotObject(obj, { includeGeometry: true })
  assert.equal(snapshotsEqual(before, after), false)
  applySnapshot(obj, before)
  const initial = line(25, 35, 145, 95, { angle: 22, scaleX: 1.3 })
  near(at(obj, 'start'), at(initial, 'start'))
  near(at(obj, 'end'), at(initial, 'end'))
  applySnapshot(obj, after)
  near(at(obj, 'start'), proposed)
  near(at(obj, 'end'), fixed)
  assert.equal(obj.stroke, '#1565c0')
})

test('controls expose only two endpoint handles with viewport-aware positions and cancellation', () => {
  const obj = line(10, 30, 110, 60)
  const view = [1.4, 0, 0, 1.4, 80, 30]
  obj.canvas = { viewportTransform: view }
  const controls = geometryControls(lineGeometryAdapter)
  assert.deepEqual(Object.keys(controls), ['geometry-start', 'geometry-end'])
  const expected = util.transformPoint(at(obj, 'start'), view)
  const rendered = controls['geometry-start'].positionHandler(new Point(0, 0), [], obj)
  near(rendered, expected)
  assert.equal(isGeometryHandleTransform({ corner: 'geometry-start' }), true)
  assert.equal(isGeometryHandleTransform({ action: 'drag' }), false)
  // The cached Fabric hit regions must use the same keys as the current controls.
  // Otherwise findControl() tries to read shouldActivate on a missing control.
  const initialControls = obj.controls
  obj.controls = controls
  obj.setCoords()
  assert.deepEqual(Object.keys(obj.oCoords).sort(), Object.keys(controls).sort())
  obj.controls = initialControls
  obj.setCoords()
  assert.deepEqual(Object.keys(obj.oCoords).sort(), Object.keys(initialControls).sort())
  const original = at(obj, 'start')
  assert.equal(controls['geometry-start'].actionHandler(null, {
    target: obj, mathboardCancelled: true,
  }, original.x + 10, original.y + 4), false)
  near(at(obj, 'start'), original)
  obj.canvas = undefined
})

test('edited line geometry survives BoardDocument and Stamp materialization', async () => {
  const obj = line(20, 30, 130, 90, { angle: 27, scaleY: 1.3, left: 240, top: 180 })
  const wanted = at(obj, 'end').add(new Point(47, -38))
  lineGeometryAdapter.moveHandle(obj, 'end', wanted)
  const originalStart = at(obj, 'start')
  const document = serializeBoardDocument({ canvas: makeControllerCanvas([obj]), boardObjectPolicy: new BoardObjectPolicy() })
  const restored = await materializeBoardDocument(document, { buildFormula: async () => null })
  near(at(restored.objects[0], 'end'), wanted)
  near(at(restored.objects[0], 'start'), originalStart)
  const stamp = stampDocumentFromObjects([obj])
  const copied = await materializeStampDocument(stamp, { buildFormula: async () => null })
  near(at(copied[0], 'end'), wanted)
  near(at(copied[0], 'start'), originalStart)
})


test('angle snapping rounds to fifteen-degree increments without changing vector length', () => {
  const anchor = { x: 12, y: -8 }
  for (const input of [
    { x: 100, y: 31 }, { x: 16, y: 111 }, { x: -60, y: -50 },
    { x: 10, y: -101 }, { x: -52, y: 93 },
  ]) {
    const snapped = snapPointToAngle(anchor, input)
    const radius = Math.hypot(input.x - anchor.x, input.y - anchor.y)
    near(snapped, {
      x: anchor.x + radius * Math.cos(Math.round(Math.atan2(input.y - anchor.y, input.x - anchor.x) / (Math.PI / 12)) * Math.PI / 12),
      y: anchor.y + radius * Math.sin(Math.round(Math.atan2(input.y - anchor.y, input.x - anchor.x) / (Math.PI / 12)) * Math.PI / 12),
    })
    assert.ok(Math.abs(Math.hypot(snapped.x - anchor.x, snapped.y - anchor.y) - radius) < EPSILON)
  }
  assert.deepEqual(snapPointToAngle(anchor, anchor), anchor)
})

test('Shift-drag constrains either endpoint in board coordinates under rotation, scale and skew', () => {
  for (const transformed of [
    {},
    { angle: 37, scaleX: 1.3, scaleY: 0.75, skewX: 12 },
    { angle: -120, scaleX: 0.8, flipX: true, flipY: true },
  ]) {
    for (const id of ['start', 'end']) {
      const obj = line(15, 30, 115, 90, { left: 240, top: 160, ...transformed })
      const opposite = id === 'start' ? 'end' : 'start'
      const fixed = at(obj, opposite)
      const wanted = fixed.add(new Point(-93, -39))
      const before = snapshotObject(obj, { includeGeometry: true })
      const original = at(obj, id)
      assert.equal(lineGeometryAdapter.moveHandle(obj, id, wanted, { shiftKey: true }), true)
      const snapped = at(obj, id)
      near(at(obj, opposite), fixed)
      near(snapped, snapPointToAngle(fixed, wanted))
      const angle = Math.atan2(snapped.y - fixed.y, snapped.x - fixed.x) * 180 / Math.PI
      assert.ok(Math.abs(angle / 15 - Math.round(angle / 15)) < 1e-7)
      const after = snapshotObject(obj, { includeGeometry: true })
      applySnapshot(obj, before)
      near(at(obj, id), original)
      applySnapshot(obj, after)
      near(at(obj, id), snapped)
      near(at(obj, opposite), fixed)
    }
  }
})

test('geometry controls forward the live Shift modifier and return to free drag when released', () => {
  const obj = line(15, 25, 115, 75, { left: 220, top: 180 })
  const controls = geometryControls(lineGeometryAdapter)
  const fixed = at(obj, 'end')
  const desired = fixed.add(new Point(-95, -37))
  const drag = { target: obj }
  assert.equal(controls['geometry-start'].actionHandler({ shiftKey: true }, drag, desired.x, desired.y), true)
  near(at(obj, 'start'), snapPointToAngle(fixed, desired))
  const free = fixed.add(new Point(-83, -29))
  assert.equal(controls['geometry-start'].actionHandler({ shiftKey: false }, drag, free.x, free.y), true)
  near(at(obj, 'start'), free)
  near(at(obj, 'end'), fixed)
})
