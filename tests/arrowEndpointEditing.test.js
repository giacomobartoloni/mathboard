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
import { Point, util } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { ArrowObject } from '../src/board/objects/ArrowObject.js'
import { arrowGeometryAdapter } from '../src/board/geometry/arrowGeometryAdapter.js'
import { geometryControls } from '../src/board/geometry/geometryHandles.js'
import { snapPointToAngle } from '../src/board/geometry/angleConstraints.js'
import { snapshotObject } from '../src/history/commandLog.js'
import { BoardHistory } from '../src/history/BoardHistory.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { serializeBoardDocument } from '../src/board/persistence/serializeBoardDocument.js'
import { materializeBoardDocument } from '../src/board/persistence/materializeBoardDocument.js'
import { stampDocumentFromObjects } from '../src/stamps/serialize.js'
import { materializeStampDocument } from '../src/stamps/materialize.js'

installFabricDomStub()

const at = (arrow, id) => arrowGeometryAdapter.readHandle(arrow, id)
function near(actual, expected) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-6, `x: ${actual.x} vs ${expected.x}`)
  assert.ok(Math.abs(actual.y - expected.y) < 1e-6, `y: ${actual.y} vs ${expected.y}`)
}
function arrow(options = {}) {
  return new ArrowObject([], {
    x1: 25, y1: 35, x2: 165, y2: 95, stroke: '#1565c0',
    fill: '#ff8800', mathboardInkMode: 'fixed', ...options,
  })
}

test('arrow endpoint handles anchor the opposite end across transforms and directions', () => {
  for (const endpoints of [
    { x1: 25, y1: 35, x2: 165, y2: 95 },
    { x1: 165, y1: 95, x2: 25, y2: 35 },
    { x1: 40, y1: 20, x2: 40, y2: 150 },
  ]) {
    for (const transform of [
      {}, { left: 270, top: 195, angle: 37, scaleX: 1.4, scaleY: 0.65, skewX: 15 },
      { left: 210, top: 160, angle: -135, flipX: true, flipY: true, scaleX: 0.8 },
      { originX: 'center', originY: 'center', angle: 85 },
    ]) {
      const obj = arrow({ ...endpoints, ...transform })
      for (const id of ['start', 'end']) {
        const opposite = id === 'start' ? 'end' : 'start'
        const fixed = at(obj, opposite)
        const wanted = at(obj, id).add(new Point(36, -28))
        assert.equal(arrowGeometryAdapter.moveHandle(obj, id, wanted), true)
        near(at(obj, id), wanted)
        near(at(obj, opposite), fixed)
        assert.deepEqual(obj.path[0], ['M', obj.x1, obj.y1])
        assert.deepEqual(obj.path[3], ['L', obj.x2, obj.y2])
        assert.ok(obj.width > 0 && obj.height > 0)
      }
    }
  }
})

test('arrow uses the existing geometry controls, live Shift and zero-length guard', () => {
  const obj = arrow({ left: 240, top: 180, angle: 22, scaleX: 1.3 })
  obj.canvas = { viewportTransform: [1.4, 0, 0, 1.4, 80, 30] }
  const controls = geometryControls(arrowGeometryAdapter)
  assert.deepEqual(Object.keys(controls), ['geometry-start', 'geometry-end'])
  near(controls['geometry-start'].positionHandler(new Point(0, 0), [], obj),
    util.transformPoint(at(obj, 'start'), obj.canvas.viewportTransform))
  const fixed = at(obj, 'end')
  const original = at(obj, 'start')
  assert.equal(controls['geometry-start'].actionHandler(null,
    { target: obj, mathboardCancelled: true }, original.x + 15, original.y + 10), false)
  near(at(obj, 'start'), original)
  assert.equal(arrowGeometryAdapter.moveHandle(obj, 'start', fixed), false)
  const wanted = fixed.add(new Point(-103, -41))
  assert.equal(controls['geometry-start'].actionHandler({ shiftKey: true }, { target: obj },
    wanted.x, wanted.y), true)
  near(at(obj, 'start'), snapPointToAngle(fixed, wanted))
  const free = fixed.add(new Point(-94, -31))
  assert.equal(controls['geometry-start'].actionHandler({ shiftKey: false }, { target: obj },
    free.x, free.y), true)
  near(at(obj, 'start'), free)
  near(at(obj, 'end'), fixed)
  obj.canvas = undefined
})

test('arrow geometry is reversible with one modify command and preserved after document/Stamp round trips', async () => {
  const obj = arrow({ left: 240, top: 180, angle: 34, scaleY: 1.3 })
  const originalPath = structuredClone(obj.path)
  const canvas = makeControllerCanvas([obj])
  const history = new BoardHistory({
    getCanvas: () => canvas,
    onDocumentChanged: () => {},
    syncAutoInk: () => {},
  })
  const before = snapshotObject(obj, { includeGeometry: true })
  assert.ok(Object.hasOwn(before, 'x1'))
  assert.equal(Object.hasOwn(snapshotObject(obj), 'x1'), false)
  const originalStart = at(obj, 'start')
  const originalEnd = at(obj, 'end')
  const target = originalEnd.add(new Point(47, -36))
  assert.equal(arrowGeometryAdapter.moveHandle(obj, 'end', target), true)
  const after = snapshotObject(obj, { includeGeometry: true })
  history.record({ type: 'modify', entries: [{ object: obj, before, after }] })
  assert.equal(history.summary().length, 1)
  assert.equal(history.undo().type, 'modify')
  near(at(obj, 'start'), originalStart)
  near(at(obj, 'end'), originalEnd)
  assert.deepEqual(obj.path, originalPath)
  assert.equal(history.redo().type, 'modify')
  near(at(obj, 'start'), originalStart)
  near(at(obj, 'end'), target)
  assert.deepEqual(obj.path[3], ['L', obj.x2, obj.y2])
  assert.equal(obj.fill, '#ff8800')

  const document = serializeBoardDocument({ canvas, boardObjectPolicy: new BoardObjectPolicy() })
  const restored = await materializeBoardDocument(document, { buildFormula: async () => null })
  near(at(restored.objects[0], 'start'), originalStart)
  near(at(restored.objects[0], 'end'), target)
  const stamp = stampDocumentFromObjects([obj])
  const copied = await materializeStampDocument(stamp, { buildFormula: async () => null })
  near(at(copied[0], 'start'), originalStart)
  near(at(copied[0], 'end'), target)
})
