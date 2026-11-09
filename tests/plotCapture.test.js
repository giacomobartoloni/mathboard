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
import { Group, Rect, util } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { readCaptureScene } from '../src/board/capture/scene.js'
import { buildPlotObject } from '../src/plots/buildPlotObject.js'
import { DEFAULT_PLOT } from '../src/plots/plotSpec.js'
import { BOARD_THEMES } from '../src/config/themes.js'

installFabricDomStub()

test('capture snapshots live Plot geometry as plain Fabric groups without semantic rebuild', async () => {
  for (const nested of [false, true]) {
    const plot = await buildPlotObject({
      ...DEFAULT_PLOT, latex: '1/x', left: 260, top: 190,
      angle: -12, color: '#2563eb',
    })
    plot.applyTheme(BOARD_THEMES.dark)
    const sourceChildren = plot.getObjects()
    const sourceFill = sourceChildren[0].fill
    const specBefore = structuredClone(plot.plotSpec)
    const root = nested ? new Group([plot, new Rect({ width: 20, height: 15 })]) : plot
    const serialized = readCaptureScene(makeControllerCanvas([root])).objects[0].data
    const capturedPlot = nested ? serialized.objects[0] : serialized

    assert.equal(capturedPlot.type, Group.type)
    assert.equal(capturedPlot.objects.length, sourceChildren.length)
    assert.equal('plotSpec' in capturedPlot, false)
    assert.equal('mathboardInkMode' in capturedPlot, true)

    const [clone] = await util.enlivenObjects([serialized])
    const clonedPlot = nested ? clone.getObjects()[0] : clone
    try {
      assert.equal(clonedPlot.isType('Group'), true)
      assert.equal(clonedPlot.getObjects().length, sourceChildren.length)
      assert.equal(clonedPlot.getObjects()[0].fill, sourceFill)
      assert.equal(clonedPlot.getObjects().filter(o => o.isType('Path')).length,
        sourceChildren.filter(o => o.isType('Path')).length)
      assert.equal(clonedPlot.getObjects().filter(o => o.isType('Text')).length,
        sourceChildren.filter(o => o.isType('Text')).length)
      assert.equal(clonedPlot.objectKind, undefined)
      assert.deepEqual(plot.plotSpec, specBefore)
      assert.equal(plot.objectKind, 'plot')
    } finally {
      clone.dispose()
    }
  }
})
