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
import { Group } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { serializeBoardDocument } from '../src/board/persistence/serializeBoardDocument.js'
import { materializeBoardDocument } from '../src/board/persistence/materializeBoardDocument.js'
import {
  decodeStampString,
  encodeStampDocument,
  getKitById,
  listKits,
  materializeStampDocument,
} from '../src/stamps/index.js'

installFabricDomStub()

const LESSON_GRIDS = [
  'cartesianGrid',
  'squareGrid',
  'ruledPaper',
  'triangularGrid',
  'complexPlane',
]

const makeCanvas = (objects) => ({ getObjects: () => objects.slice() })

test('FEAT-4 exposes at least five educational kits in the existing catalog', () => {
  const kits = listKits()
  assert.ok(kits.length >= 7)
  for (const id of LESSON_GRIDS) {
    const meta = kits.find((kit) => kit.id === id)
    assert.ok(meta?.label)
  }
})

for (const id of LESSON_GRIDS) {
  test('FEAT-4 ' + id + ' survives stamp and BoardDocument round-trip', async () => {
    const encoded = getKitById(id)
    const stamp = decodeStampString(encoded)

    assert.equal(encodeStampDocument(stamp), encoded)
    assert.equal(stamp.objects.length, 1)
    assert.equal(stamp.objects[0].type, 'group')
    const children = stamp.objects[0].objects
    assert.ok(children.length >= 10)
    assert.ok(children.every((node) => node.type === 'line' || node.type === 'text'))
    for (const node of children.filter((entry) => entry.type === 'line')) {
      for (const coord of ['x1', 'y1', 'x2', 'y2']) {
        assert.ok(Number.isFinite(node[coord]), coord + ' must be finite')
        assert.ok(Math.abs(node[coord]) <= 200 + 1e-7, coord + ' is outside the grid bounds')
      }
    }

    const fabricObjects = await materializeStampDocument(stamp, {
      buildFormula: async () => null,
    })
    assert.equal(fabricObjects.length, 1)
    assert.ok(fabricObjects[0] instanceof Group)
    assert.equal(fabricObjects[0].getObjects().length, children.length)

    const policy = new BoardObjectPolicy()
    const original = serializeBoardDocument({
      canvas: makeCanvas(fabricObjects),
      boardObjectPolicy: policy,
      title: id,
    })
    const { objects: restored } = await materializeBoardDocument(original, {
      buildFormula: async () => null,
    })
    const reopened = serializeBoardDocument({
      canvas: makeCanvas(restored),
      boardObjectPolicy: policy,
      title: id,
    })
    assert.deepEqual(reopened, original)
  })
}

test('FEAT-4 Cartesian grid has 10x10 cells with centered bold axes', () => {
  const grid = decodeStampString(getKitById('cartesianGrid')).objects[0].objects
  const lines = grid.filter((object) => object.type === 'line')
  assert.equal(lines.length, 22)
  assert.equal(lines.filter((object) => object.strokeWidth === 2).length, 2)
  assert.ok(lines.some((object) => object.x1 === 0 && object.x2 === 0))
  assert.ok(lines.some((object) => object.y1 === 0 && object.y2 === 0))
})

test('FEAT-4 5 mm square grid uses nominal CSS 96 px/in step', () => {
  const grid = decodeStampString(getKitById('squareGrid')).objects[0].objects
  const vertical = grid.filter((object) => object.type === 'line' && object.x1 === object.x2)
  const coords = vertical.map((object) => object.x1).sort((a, b) => a - b)
  assert.ok(vertical.length >= 19)
  const pitch = coords[1] - coords[0]
  assert.ok(Math.abs(pitch - 96 * 5 / 25.4) < 1e-9)
})

test('FEAT-4 triangular grid is clipped and has three line orientations', () => {
  const grid = decodeStampString(getKitById('triangularGrid')).objects[0].objects
  const slopes = new Set(grid.map((entry) => {
    if (Math.abs(entry.y2 - entry.y1) < 1e-8) return 'horizontal'
    return (entry.y2 - entry.y1) / (entry.x2 - entry.x1) > 0 ? 'up' : 'down'
  }))
  assert.deepEqual([...slopes].sort(), ['down', 'horizontal', 'up'])
})
