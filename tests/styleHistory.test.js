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
import { Rect, IText } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { snapshotObject, applySnapshot } from '../src/history/commandLog.js'

installFabricDomStub()

for (const make of [() => new Rect({ width: 40, height: 20 }), () => new IText('Ink')]) {
  test(`style snapshots restore ${make().constructor.type} paint, opacity, ink and independent dash arrays`, () => {
    const object = make()
    object.set({ stroke: '#123456', fill: null, opacity: 0.7, strokeWidth: 4,
      strokeDashArray: [8, 3], strokeLineCap: 'round', strokeLineJoin: 'bevel', mathboardInkMode: 'fixed' })
    const before = snapshotObject(object)
    object.strokeDashArray[0] = 999
    object.set({ stroke: '#abcdef', fill: '#ff0000', opacity: 1, strokeWidth: 1,
      strokeLineCap: 'butt', strokeLineJoin: 'miter', mathboardInkMode: 'auto' })
    assert.deepEqual(before.strokeDashArray, [8, 3])
    applySnapshot(object, before)
    assert.equal(object.stroke, '#123456')
    assert.equal(object.fill, null)
    assert.equal(object.opacity, 0.7)
    assert.equal(object.strokeWidth, 4)
    assert.equal(object.strokeLineCap, 'round')
    assert.equal(object.strokeLineJoin, 'bevel')
    assert.equal(object.mathboardInkMode, 'fixed')
    assert.deepEqual(object.strokeDashArray, [8, 3])
    object.strokeDashArray[1] = 999
    assert.deepEqual(before.strokeDashArray, [8, 3])
  })
}
