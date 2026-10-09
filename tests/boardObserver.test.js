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
import { Rect, Path, ActiveSelection } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { FormulaObject } from '../src/formulas/FormulaObject.js'
import { ensureMathBoardObjectId } from '../src/board/ids.js'
import { serializeBoardState } from '../src/board/observe/serializeBoardState.js'

installFabricDomStub()
const policy = new BoardObjectPolicy()

test('observer exposes JSON-safe viewport, selected IDs and rotated scene bounds', () => {
  const object = new Rect({ left: 100, top: 80, width: 50, height: 40, angle: 30 })
  ensureMathBoardObjectId(object, 'mbobj_rotated')
  object.setCoords()
  const canvas = makeControllerCanvas([object])
  canvas.viewportTransform = [2, 0, 0, 2, 60, 80]
  canvas.getZoom = () => 2
  canvas.setActiveObject(object)
  const state = serializeBoardState({ canvas, boardObjectPolicy: policy, boardId: 'mb_board' })
  assert.equal(state.version, 1)
  assert.equal(state.boardId, 'mb_board')
  assert.deepEqual(state.viewport, { zoom: 2, width: 1200, height: 800, transform: [2, 0, 0, 2, 60, 80] })
  assert.deepEqual(state.selection.ids, ['mbobj_rotated'])
  assert.equal(state.objects[0].angle, 30)
  for (const value of Object.values(state.objects[0].bounds)) assert.equal(Number.isFinite(value), true)
  assert.ok(state.objects[0].bounds.width > 50)
  assert.ok(state.objects[0].bounds.height > 40)
  assert.doesNotThrow(() => JSON.stringify(state))
  state.viewport.transform[4] = 999
  assert.equal(canvas.viewportTransform[4], 60)
})

test('Formula observation excludes renderer children and polarity while keeping bounds', () => {
  const formula = new FormulaObject([new Path('M 0 0 L 20 20')], { latex: 'x=1', left: 250, top: 160 })
  ensureMathBoardObjectId(formula, 'mbobj_formula')
  formula.mathboardRenderedInkIsLight = true
  formula.setCoords()
  const state = serializeBoardState({ canvas: makeControllerCanvas([formula]), boardObjectPolicy: policy })
  assert.equal(state.objects[0].type, 'formula')
  assert.equal(state.objects[0].latex, 'x=1')
  assert.equal(state.objects[0].objects, undefined)
  assert.equal(state.objects[0].mathboardRenderedInkIsLight, undefined)
  assert.ok(state.objects[0].bounds.width > 0)
  assert.ok(state.objects[0].bounds.height > 0)
})

test('ActiveSelection observation returns member IDs and canvas-plane bounds without changing the selection', () => {
  const members = [100, 200].map((left, index) => {
    const object = new Rect({ left, top: 150, width: 50, height: 40, originX: 'left', originY: 'top' })
    ensureMathBoardObjectId(object, `mbobj_${index}`)
    return object
  })
  const selection = new ActiveSelection(members)
  selection.set({ left: selection.left + 60, top: selection.top + 40 })
  selection.setCoords()
  const before = members.map((o) => ({ left: o.left, top: o.top }))
  const canvas = makeControllerCanvas(members)
  canvas.setActiveObject(selection)
  const state = serializeBoardState({ canvas, boardObjectPolicy: policy })
  assert.deepEqual(state.selection.ids, ['mbobj_0', 'mbobj_1'])
  assert.equal(state.objects[0].left, 160)
  assert.equal(state.objects[0].top, 190)
  assert.equal(state.objects[0].bounds.left, 160)
  assert.equal(state.objects[0].bounds.top, 190)
  assert.deepEqual(members.map((o) => ({ left: o.left, top: o.top })), before)
  assert.equal(canvas.getActiveObject(), selection)
})
