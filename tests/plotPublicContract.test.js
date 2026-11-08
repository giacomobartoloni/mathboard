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
import { getLocalAgentHelp } from '../dev-agent/command-contract.js'
import { executeBoardCommand } from '../src/board/agent/command-registry.js'
import { acceptsSchema } from './helpers/check-discovery-schema.js'
import { DEFAULT_PLOT } from '../src/plots/plotSpec.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { BoardController } from '../src/board/BoardController.js'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
installFabricDomStub()
const plot = { ...DEFAULT_PLOT, color: 'auto', left: 120, top: 100 }
const help = getLocalAgentHelp()
const create = help.methods.find(x => x.method === 'create')
const createMany = help.methods.find(x => x.method === 'createMany')
const update = help.methods.find(x => x.method === 'update')

test('public plot contracts cover create, nested createMany, update and results', () => {
  assert.equal(help.objectTypes.filter(type => type === 'plot').length, 1)
  assert.ok(help.examplesByType.plot)
  assert.equal(acceptsSchema(create.paramsSchema, { spec: plot }), true)
  for (const transparentBackground of [true, false]) {
    assert.equal(acceptsSchema(create.paramsSchema, { spec: { ...plot, transparentBackground } }), true)
    assert.equal(acceptsSchema(createMany.paramsSchema, { specs: [
      { type: 'group', objects: [{ ...plot, transparentBackground }] }
    ] }), true)
    assert.equal(acceptsSchema(update.paramsSchema, { id: 'example',
      patch: { transparentBackground } }), true)
  }
  assert.deepEqual(help.patchSchemas.plot.properties.transparentBackground,
    { type: 'boolean', default: false })
  assert.equal(acceptsSchema(createMany.paramsSchema, { specs: [{ type: 'group', objects: [plot] }] }), true)
  assert.equal(acceptsSchema(update.paramsSchema, { id: 'example', patch: { color: 'auto', grid: false } }), true)
  assert.equal(acceptsSchema(create.resultSchema, { id: 'a', type: 'plot' }), true)
  assert.ok(help.patchSchemas.plot)
  assert.equal(acceptsSchema(create.paramsSchema, { spec: { ...plot, latex: 'x'.repeat(2048) } }), true)
})

test('plot schema rejects ignored paint and malformed mathematical fields', () => {
  const bad = [
    { ...plot, fill: '#000' }, { ...plot, mathboardInkMode: 'fixed' },
    { ...plot, axisNumbers: null }, { ...plot, color: 'purple' },
    { ...plot, transparentBackground: null }, { ...plot, transparentBackground: 'true' },
    { ...plot, syntax: 'js' }, { ...plot, latex: 'x'.repeat(2049) },
    { ...plot, mathWindow: { xMin: -3 } },
    { ...plot, frame: { width: 79, height: 320 } },
    { ...plot, mathWindow: { ...plot.mathWindow, xMin: -1e13 } },
  ]
  for (const spec of bad) assert.equal(acceptsSchema(create.paramsSchema, { spec }), false)
})

test('public ingress rejects ignored fields before dispatch, recursively and in batches', async () => {
  let called = 0
  const controller = {
    create() { called++; return {} },
    createMany() { called++; return [] },
  }
  await executeBoardCommand(controller, { method: 'create', params: { spec: plot } })
  assert.equal(called, 1)
  for (const spec of [
    { ...plot, fill: 'red' },
    { ...plot, opacity: 2 },
    { ...plot, transparentBackground: 1 },
    { type: 'group', objects: [{ ...plot, plotBoardInk: 'red' }] },
    { type: 'group', objects: [{ ...plot, plotStatus: 'ok' }] },
  ]) {
    await assert.rejects(async () => executeBoardCommand(controller, { method: 'create', params: { spec } }),
      { code: 'invalid_object_spec' })
  }
  await assert.rejects(async () => executeBoardCommand(controller, {
    method: 'createMany', params: { specs: [{ type: 'rect', width: 30, height: 20 },
      { ...plot, samples: [] }] },
  }), { code: 'invalid_object_spec' })
  assert.equal(called, 1)
})

test('plot edits reject invalid nested patches without changing history', async () => {
  const canvas = makeControllerCanvas(), history = []
  const controller = new BoardController({
    getCanvas: () => canvas, boardObjectPolicy: new BoardObjectPolicy(),
    buildFormula: async () => { throw Error('Unexpected formula') },
    pushHistoryCommand: entry => history.push(entry), isMutationStable: () => true,
  })
  const created = await controller.create(plot)
  const original = canvas.getObjects()[0]
  for (const patch of [
    { mathWindow: { xMin: -2 } }, { frame: { width: 10, height: 160 } },
    { color: 'invalid' }, { axes: 'false' }, { transparentBackground: 'false' },
    { mathWindow: { ...plot.mathWindow, xMin: 7, xMax: -7 } },
  ]) {
    await assert.rejects(controller.update(created.id, patch), { code: 'invalid_object_patch' })
  }
  assert.equal(history.length, 1)
  assert.equal(canvas.getObjects()[0], original)
  const edited = await controller.update(created.id, { border: false, grid: false, transparentBackground: true })
  assert.equal(edited.id, created.id)
  assert.equal(edited.border, false)
  assert.equal(edited.grid, false)
  assert.equal(edited.transparentBackground, true)
  assert.equal(canvas.getObjects()[0].getObjects()[0].fill, 'transparent')
  const reset = await controller.update(created.id, { transparentBackground: false })
  assert.equal(reset.transparentBackground, false)
  assert.notEqual(canvas.getObjects()[0].getObjects()[0].fill, 'transparent')
})
