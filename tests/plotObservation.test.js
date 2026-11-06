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
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardController } from '../src/board/BoardController.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { buildPlotObject } from '../src/plots/buildPlotObject.js'
import { DEFAULT_PLOT } from '../src/plots/plotSpec.js'
import { serializeBoardDocument } from '../src/board/persistence/serializeBoardDocument.js'
import { createPlotRenderCoordinator } from '../src/plots/PlotRenderCoordinator.js'

installFabricDomStub()
const spec = { ...DEFAULT_PLOT, latex: 'x^2', left: 90, top: 110 }
const policy = new BoardObjectPolicy()
const controllerHarness = () => {
  const canvas = makeControllerCanvas(), history = []
  const controller = new BoardController({
    getCanvas: () => canvas, boardObjectPolicy: policy,
    buildFormula: async () => { throw new Error('Unexpected formula') },
    pushHistoryCommand: entry => history.push(entry), isMutationStable: () => true,
  })
  return { canvas, history, controller }
}

test('plot result and full/summary observation carry detached derived status only', async () => {
  const { canvas, controller } = controllerHarness()
  const created = await controller.create(spec)
  assert.equal(created.type, 'plot')
  assert.equal(created.plotStatus, 'ok')
  assert.equal(created.latex, 'x^2')
  const full = controller.observe('full').objects[0]
  assert.equal(full.plotStatus, 'ok')
  assert.deepEqual(full.mathWindow, spec.mathWindow)
  const summary = controller.observe('summary').objects[0]
  assert.equal(summary.plotStatus, 'ok')
  assert.equal(summary.mathWindow, undefined)
  const pure = controller.get(created.id)
  assert.equal(pure.plotStatus, undefined)
  assert.equal(serializeBoardDocument({ canvas, boardObjectPolicy: policy }).objects[0].plotStatus, undefined)
  full.mathWindow.xMin = -999
  assert.equal(controller.get(created.id).mathWindow.xMin, spec.mathWindow.xMin)
})

test('nested plot results use group semantics, not rendered plot subobjects', async () => {
  const { canvas, controller } = controllerHarness()
  const graph = await buildPlotObject(spec)
  canvas.insertAt(0, new Group([graph]))
  const full = controller.observe('full').objects[0]
  assert.equal(full.type, 'group')
  assert.equal(full.objects[0].type, 'plot')
  assert.equal(full.objects[0].plotStatus, 'ok')
  assert.equal(full.objects[0].objects, undefined)
  assert.equal(controller.observe('summary').objects[0].objects, undefined)
})

test('agent renderer classifies math failures without leaking supplied messages', async () => {
  for (const [code, expected] of [
    ['invalid_expression', 'plot_invalid_expression'],
    ['unsupported_expression', 'plot_unsupported_expression'],
    ['no_real_samples', 'plot_no_real_samples'],
    ['computation_limit', 'plot_computation_limit'],
    ['evaluator_failure', 'plot_render_failed'],
  ]) {
    const renderer = createPlotRenderCoordinator(async () => async () => {
      throw Object.assign(new Error('confidential /home/user/source.tex'), { code })
    })
    await assert.rejects(renderer.forRequest({ expiresAtMs: Date.now() + 10000 })(spec),
      error => error.code === expected && !error.message.includes('confidential'))
  }
})
