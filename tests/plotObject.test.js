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
import { BOARD_THEMES } from '../src/config/themes.js'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { buildPlotObject } from '../src/plots/buildPlotObject.js'
import { computePlot } from '../src/plots/computePlot.js'
import { validatePlotSpec } from '../src/plots/plotSpec.js'
import { readSemanticBoardObject } from '../src/board/objects/serialize.js'
installFabricDomStub()
export const plot = {
  type: 'plot',
  syntax: 'latex-v1',
  latex: 'x^2-5x+6',
  mathWindow: { xMin: -0.5, xMax: 5.5, yMin: -2, yMax: 7 },
  frame: { width: 480, height: 320 },
  axes: true,
  grid: true
}

test('plot is atomic, source-preserving and semantically distinct from a Group', async () => {
  const object = await buildPlotObject({ ...plot, left: 90, top: 120, angle: 15 })
  const policy = new BoardObjectPolicy()
  assert.equal(policy.kindOf(object), 'plot')
  assert.equal(policy.isBoardGroup(object), false)
  assert.equal(policy.capabilitiesOf(object).ungroup, false)
  const node = readSemanticBoardObject(object)
  assert.equal(node.type, 'plot')
  assert.equal(node.latex, plot.latex)
  assert.deepEqual(node.mathWindow, plot.mathWindow)
  assert.equal(node.left, 90)
  assert.equal(node.angle, 15)
  assert.equal('objects' in node, false)
  assert.equal('segments' in node, false)
  assert.ok(object.getObjects().every((o) => !o.selectable && !o.evented))
})
test('cloning standalone and nested plots preserves editable semantics', async () => {
  const object = await buildPlotObject(plot)
  for (const source of [object, new Group([object])]) {
    const clone = await source.clone()
    const p = clone.objectKind === 'plot' ? clone : clone.getObjects()[0]
    assert.equal(p.objectKind, 'plot')
    assert.deepEqual(p.plotSpec.mathWindow, plot.mathWindow)
    assert.equal(readSemanticBoardObject(p).latex, plot.latex)
  }
})
test('preview geometry clips discontinuous branches into separate finite paths', () => {
  const data = computePlot({
    ...plot,
    latex: '1/x',
    mathWindow: { xMin: -2, xMax: 2, yMin: -4, yMax: 4 }
  })
  assert.ok(data.curves.length >= 2)
  assert.ok(data.curves.every((path) => !path.includes('NaN') && !path.includes('Infinity')))
  assert.ok(data.labels.length > 0)
  assert.throws(() => computePlot({ ...plot, latex: '\\sqrt{-1}' }), { code: 'no_real_samples' })
})
test('plot schema bounds and flags reject malformed inputs without heavy parsing', () => {
  for (const spec of [
    { ...plot, syntax: 'js' },
    { ...plot, axes: 'yes' },
    { ...plot, frame: { width: 0, height: 320 } },
    { ...plot, mathWindow: { ...plot.mathWindow, xMax: Infinity } },
    { ...plot, latex: 'x'.repeat(2049) }
  ])
    assert.throws(() => validatePlotSpec(spec))
})
test('plot ink follows AUTO without repainting the opaque surface', async () => {
  const object = await buildPlotObject(plot)
  object.applyInk('#ffffff')
  assert.equal(object.getObjects()[0].fill, '#f9f9f9')
  assert.ok(
    object
      .getObjects()
      .slice(1)
      .every((o) => o.stroke === '#ffffff' || o.fill === '#ffffff')
  )
})

test('switching a fixed-color plot back to board ink restores AUTO mode', async () => {
  const blue = await buildPlotObject({ ...plot, color: '#2563eb' })
  assert.equal(blue.mathboardInkMode, 'fixed')
  const automatic = await buildPlotObject({ ...readSemanticBoardObject(blue), color: 'auto' })
  assert.equal(automatic.mathboardInkMode, 'auto')
})

test('isolated real points remain visible in preview and board geometry', async () => {
  const spec = {
    ...plot,
    latex: '\\sqrt{-x^2}',
    mathWindow: { xMin: -2, xMax: 2, yMin: -1, yMax: 1 }
  }
  const data = computePlot(spec)
  assert.ok(data.dots.some((p) => p.x === 240 && p.y === 160))
  const object = await buildPlotObject(spec)
  assert.ok(object.getObjects().some((o) => o.isType('Circle')))
})

test('fixed curve color leaves axes and labels on board ink across theme changes', async () => {
  const object = await buildPlotObject({ ...plot, color: '#2563eb' })
  object.applyInk('#eeeeee')
  const curve = object.getObjects().filter((o) => o.plotCurve)
  const decorations = object
    .getObjects()
    .slice(1)
    .filter((o) => !o.plotCurve)
  assert.ok(curve.length > 0)
  assert.ok(curve.every((o) => o.stroke === '#2563eb' || o.fill === '#2563eb'))
  assert.ok(decorations.every((o) => o.stroke === '#eeeeee' || o.fill === '#eeeeee'))
})

test('duplicating a plot preserves current board ink including nested group clones', async () => {
  const object = await buildPlotObject({ ...plot, color: '#2563eb' })
  object.applyInk('#f5f5f5')
  for (const source of [object, new Group([object])]) {
    const clone = await source.clone()
    const p = clone.objectKind === 'plot' ? clone : clone.getObjects()[0]
    assert.ok(
      p
        .getObjects()
        .slice(1)
        .filter((o) => !o.plotCurve)
        .every((o) => o.stroke === '#f5f5f5' || o.fill === '#f5f5f5')
    )
  }
})

test('Fabric frame and sampled geometry share the same local origin and dimensions',async()=>{
 const object=await buildPlotObject({...plot,frame:{width:480,height:320}})
 assert.ok(object.width>=480&&object.width<=483,`Unexpected width ${object.width}`)
 assert.ok(object.height>=320&&object.height<=323,`Unexpected height ${object.height}`)
})


test('graph surface stays opaque with mathematical grid enabled or disabled', async () => {
  for (const grid of [true, false]) {
    const object = await buildPlotObject({ ...plot, grid })
    const surface = object.getObjects()[0]
    assert.equal(surface.fill, '#f9f9f9')
    assert.equal(surface.opacity, 1)
    assert.equal(surface.stroke, null)
  }
})

test('theme updates change the graph surface independently of a fixed curve color', async () => {
  const object = await buildPlotObject({ ...plot, color: '#2563eb' })
  for (const [name, background] of [['dark','#1e1e22'],['chalkboard','#244a3b'],['light','#f9f9f9']]) {
    object.applyTheme(BOARD_THEMES[name])
    assert.equal(object.getObjects()[0].fill, background)
    assert.equal(object.getObjects()[0].opacity, 1)
    assert.ok(object.getObjects().filter(o => o.plotCurve).every(o => o.stroke === '#2563eb' || o.fill === '#2563eb'))
  }
})

test('standalone and grouped graph clones retain the current opaque theme surface', async () => {
  const object = await buildPlotObject(plot)
  object.applyTheme(BOARD_THEMES.chalkboard)
  for (const source of [object, new Group([object])]) {
    const clone = await source.clone()
    const graph = clone.objectKind === 'plot' ? clone : clone.getObjects()[0]
    assert.equal(graph.getObjects()[0].fill, '#244a3b')
    assert.equal(graph.getObjects()[0].opacity, 1)
  }
  const semantic = readSemanticBoardObject(object)
  assert.equal('plotBoardBackground' in semantic, false)
  const restored = await buildPlotObject(semantic)
  restored.applyTheme(BOARD_THEMES.dark)
  assert.equal(restored.getObjects()[0].fill, '#1e1e22')
})
