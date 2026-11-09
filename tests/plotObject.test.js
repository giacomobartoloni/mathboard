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
import { spawnSync } from 'node:child_process'
import { Group } from 'fabric'
import { BOARD_THEMES } from '../src/config/themes.js'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { buildPlotObject } from '../src/plots/buildPlotObject.js'
import { computePlot } from '../src/plots/computePlot.js'
import { DEFAULT_PLOT, validatePlotSpec } from '../src/plots/plotSpec.js'
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

test('optional border removes only the frame while retaining an opaque graph surface', async () => {
  for (const border of [undefined, true, false]) {
    const object = await buildPlotObject({ ...plot, grid: false, axes: false, ...(border === undefined ? {} : { border }) })
    const outlines = object.getObjects().filter(o => o.isType('Rect') && o.stroke)
    assert.equal(outlines.length, border === false ? 0 : 1)
    assert.equal(object.getObjects()[0].fill, '#f9f9f9')
    assert.equal(object.getObjects()[0].opacity, 1)
    assert.equal(object.plotSpec.border, border !== false)
    const clone = await object.clone()
    assert.equal(clone.plotSpec.border, border !== false)
    assert.equal(clone.getObjects().filter(o => o.isType('Rect') && o.stroke).length, outlines.length)
  }
})

test('graph border option rejects nonboolean values', () => {
  for (const border of [null, 'false', 0, {}]) assert.throws(() => validatePlotSpec({ ...plot, border }))
})

test('transparent graph surface keeps frame bounds, theme paint and semantic state across clones', async () => {
  for (const transparentBackground of [undefined, false, true]) {
    const spec = { ...plot, grid: false, axes: false, border: false,
      ...(transparentBackground === undefined ? {} : { transparentBackground }) }
    const object = await buildPlotObject(spec)
    const expectedFill = transparentBackground === true ? 'transparent' : '#f9f9f9'
    assert.equal(object.getObjects()[0].fill, expectedFill)
    assert.equal(object.getObjects()[0].opacity, 1)
    assert.equal(object.getObjects()[0].plotBackground, true)
    assert.equal(object.getObjects()[0].width, 480)
    assert.equal(object.getObjects()[0].height, 320)
    assert.equal(object.plotSpec.transparentBackground, transparentBackground === true)
    const serialized = readSemanticBoardObject(object)
    assert.equal(serialized.transparentBackground, transparentBackground === true)

    object.applyTheme(BOARD_THEMES.dark)
    assert.equal(object.getObjects()[0].fill,
      transparentBackground === true ? 'transparent' : BOARD_THEMES.dark.background)
    object.applyInk('#eeeeee')
    assert.equal(object.getObjects()[0].fill,
      transparentBackground === true ? 'transparent' : BOARD_THEMES.dark.background)

    for (const source of [object, new Group([object])]) {
      const clone = await source.clone()
      const graph = clone.objectKind === 'plot' ? clone : clone.getObjects()[0]
      assert.equal(graph.plotSpec.transparentBackground, transparentBackground === true)
      assert.equal(graph.getObjects()[0].fill,
        transparentBackground === true ? 'transparent' : BOARD_THEMES.dark.background)
    }
  }
})

test('transparent graph background rejects nonboolean values', () => {
  for (const transparentBackground of [null, 'true', 1, {}]) {
    assert.throws(() => validatePlotSpec({ ...plot, transparentBackground }))
  }
})

test('grid lines leave the perimeter clear with aligned bounds and decimal roundoff', () => {
  for (const [mathWindow, expectedCount] of [
    [{ xMin: -6, xMax: 6, yMin: -4, yMax: 4 }, 12],
    [{ xMin: 0.3, xMax: 1.1, yMin: 0.3, yMax: 1.1 }, 14]
  ]) {
    for (const border of [false, true]) {
      const { grid } = computePlot({ ...DEFAULT_PLOT, frame: { width: 480, height: 320 }, mathWindow, axes: false, border })
      assert.equal(grid.length, expectedCount)
      for (const line of grid) {
        const [, x1, y1, , x2, y2] = line.split(' ').map(Number)
        if (x1 === x2) assert.ok(x1 > 0.5 && x1 < 479.5, `Vertical grid line forms a border: ${line}`)
        else assert.ok(y1 === y2 && y1 > 0.5 && y1 < 319.5, `Horizontal grid line forms a border: ${line}`)
      }
    }
  }
})

test('grid generation terminates when narrow bounds make the tick index stop advancing', () => {
  const fixtures = [
    { xMin: 1, xMax: 1.0000000000000002, yMin: -1, yMax: 1 },
    { xMin: -1, xMax: 1, yMin: 1, yMax: 1.0000000000000002 },
    { xMin: 1e10, xMax: 10000000000.000002, yMin: -1, yMax: 1 }
  ].map(mathWindow => ({ ...DEFAULT_PLOT, latex: '0', mathWindow, border: false }))
  const moduleUrl = new URL('../src/plots/computePlot.js', import.meta.url).href
  // Isolate a potentially stuck computation so this regression cannot hang the suite.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { computePlot } from ${JSON.stringify(moduleUrl)}
    for (const spec of ${JSON.stringify(fixtures)}) computePlot(spec)
    console.log('completed')
  `], { timeout: 10000, encoding: 'utf8' })
  assert.equal(result.error, undefined, 'Grid computation must finish within the child deadline')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'completed')
})

test('axis numbers can hide labels while preserving axes, grid and curve', async () => {
  for (const axisNumbers of [undefined, true, false]) {
    const spec = { ...DEFAULT_PLOT, ...(axisNumbers === undefined ? {} : { axisNumbers }) }
    const data = computePlot(spec)
    assert.equal(data.axes.length, 2)
    assert.equal(data.grid.length, 12)
    assert.equal(data.curves.length, 1)
    assert.equal(data.labels.length > 0, axisNumbers !== false)
    const object = await buildPlotObject(spec)
    assert.equal(object.getObjects().some(child => child.isType('Text')), axisNumbers !== false)
    assert.equal(object.plotSpec.axisNumbers, axisNumbers !== false)
    const clone = await object.clone()
    assert.equal(clone.plotSpec.axisNumbers, axisNumbers !== false)
    assert.equal(clone.getObjects().some(child => child.isType('Text')), axisNumbers !== false)
  }
  assert.deepEqual(computePlot({ ...DEFAULT_PLOT, axes: false, axisNumbers: true }).labels, [])
})

test('axis numbers option rejects nonboolean values', () => {
  for (const axisNumbers of [null, 'false', 0, {}])
    assert.throws(() => validatePlotSpec({ ...DEFAULT_PLOT, axisNumbers }), { code: 'invalid_plot' })
})
