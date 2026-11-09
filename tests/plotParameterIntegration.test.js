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
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { BoardController } from '../src/board/BoardController.js'
import { DEFAULT_PLOT } from '../src/plots/plotSpec.js'
import { buildPlotObject } from '../src/plots/buildPlotObject.js'
import { serializeBoardDocument } from '../src/board/persistence/serializeBoardDocument.js'
import { materializeBoardDocument } from '../src/board/persistence/materializeBoardDocument.js'
import { boardDocumentVersionForObjects, validateBoardDocument } from '../src/board/persistence/schema.js'
import { getLocalAgentHelp } from '../dev-agent/command-contract.js'
import { executeBoardCommand } from '../src/board/agent/command-registry.js'
import { acceptsSchema } from './helpers/check-discovery-schema.js'

installFabricDomStub()
const param = (symbol, value) => ({ symbol, value, min: -5, max: 5, step: 0.1 })
const spec = { ...DEFAULT_PLOT, latex: 'a\\cdot x^2+b',
  parameters: [param('a', 2), param('b', 1)] }
const policy = new BoardObjectPolicy()
const buildFormula = async () => { throw Error('Unexpected formula') }
function setup() {
  const canvas = makeControllerCanvas(), history = []
  const controller = new BoardController({
    getCanvas: () => canvas, boardObjectPolicy: policy, buildFormula,
    pushHistoryCommand: item => history.push(item), isMutationStable: () => true,
  })
  return { canvas, history, controller }
}

test('v1 plot-free, v2 static, conditional v3 parametric including nested plots', async () => {
  assert.equal(boardDocumentVersionForObjects([]), 1)
  assert.equal(boardDocumentVersionForObjects([{ type: 'plot' }]), 2)
  assert.equal(boardDocumentVersionForObjects([{ type: 'plot', parameters: [] }]), 2)
  const nested = [{ type: 'group', objects: [{ ...spec, type: 'plot', id: 'nested' }] }]
  assert.equal(boardDocumentVersionForObjects(nested), 3)
  const document = { format: 'mathboard-board', version: 3, title: 'Parameters',
    objects: [{ id: 'root', type: 'group', objects: [{ ...spec, type: 'plot', id: 'nested' }] }] }
  assert.equal(validateBoardDocument(document), document)
  for (const older of [1, 2]) {
    assert.throws(() => validateBoardDocument({ ...document, version: older }),
      { code: 'board_document_unsupported_version' })
  }
  const restored = await materializeBoardDocument(document, { buildFormula })
  const saved = serializeBoardDocument({
    canvas: { getObjects: () => restored.objects }, boardObjectPolicy: policy, title: 'Parameters' })
  assert.equal(saved.version, 3)
  assert.deepEqual(saved.objects[0].objects[0].parameters, spec.parameters)
})

test('create, edit, read, undo replay and reserialize per-Plot bindings', async () => {
  const { canvas, controller, history } = setup()
  const created = await controller.create({ ...spec, left: 123, top: 50 })
  assert.deepEqual(created.parameters, spec.parameters)
  assert.equal(created.plotStatus, 'ok')
  assert.equal(controller.observe('full').objects[0].parameters.length, 2)
  assert.equal(controller.observe('summary').objects[0].parameters, undefined)
  const before = canvas.getObjects()[0]
  const changed = [param('a', -1), param('b', 2)]
  const updated = await controller.update(created.id, { parameters: changed })
  assert.equal(updated.id, created.id)
  assert.equal(updated.left, 123)
  assert.deepEqual(updated.parameters, changed)
  assert.equal(history.length, 2)
  assert.equal(history[1].type, 'replace')
  assert.equal(history[1].removed, before)
  assert.equal(serializeBoardDocument({ canvas, boardObjectPolicy: policy }).version, 3)
  canvas.remove(history[1].added)
  canvas.insertAt(0, history[1].removed)
  assert.deepEqual(controller.get(created.id).parameters, spec.parameters)
  canvas.remove(history[1].removed)
  canvas.insertAt(0, history[1].added)
  assert.deepEqual(controller.get(created.id).parameters, changed)
})

test('public Plot schema and existing local agent methods accept variable-length definitions', async () => {
  const help = getLocalAgentHelp(), create = help.methods.find(m => m.method === 'create')
  const createMany = help.methods.find(m => m.method === 'createMany')
  const update = help.methods.find(m => m.method === 'update')
  assert.equal(acceptsSchema(create.paramsSchema, { spec }), true)
  assert.equal(acceptsSchema(createMany.paramsSchema, {
    specs: [{ type: 'group', objects: [spec] }] }), true)
  assert.equal(acceptsSchema(update.paramsSchema, { id: 'id', patch: { parameters: spec.parameters } }), true)
  assert.equal(help.patchSchemas.plot.properties.parameters.type, 'array')
  const five = ['a','b','c','d','f'].map((symbol, i) => param(symbol, i))
  assert.equal(acceptsSchema(create.paramsSchema, { spec: { ...spec, parameters: five } }), true)
  for (const wrong of [
    { ...spec, parameters: [{ ...param('a', 1), unknown: true }] },
    { ...spec, parameters: [param('a', Infinity)] },
    { ...spec, parameters: 'a' },
  ]) assert.equal(acceptsSchema(create.paramsSchema, { spec: wrong }), false)
  let invoked = 0
  const facade = { create: () => { invoked++; return {} } }
  await executeBoardCommand(facade, { method: 'create', params: { spec } })
  await assert.rejects(executeBoardCommand(facade, { method: 'create',
    params: { spec: { ...spec, parameters: [param('a', 1), param('a', 2)] } } }),
  { code: 'invalid_object_spec' })
  assert.equal(invoked, 1)
})

test('valid-empty parameters are observable but are not persisted as status metadata', async () => {
  const { canvas, controller } = setup()
  const target = { ...DEFAULT_PLOT, latex: '\\sqrt{x-a}',
    mathWindow: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
    parameters: [param('a', 3)] }
  const obj = await buildPlotObject(target)
  assert.equal(obj.plotStatus, 'no_real_samples')
  const created = await controller.create(target)
  assert.equal(created.plotStatus, 'no_real_samples')
  assert.equal(controller.observe('full').objects[0].plotStatus, 'no_real_samples')
  assert.equal(controller.observe('summary').objects[0].plotStatus, 'no_real_samples')
  const document = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  assert.equal(document.version, 3)
  assert.equal(document.objects[0].plotStatus, undefined)
  assert.deepEqual(document.objects[0].parameters, target.parameters)
})

test('parametric Plot can remain inside a board group', async () => {
  const canvas = makeControllerCanvas()
  canvas.insertAt(0, new Group([await buildPlotObject(spec)]))
  const saved = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  assert.equal(saved.version, 3)
  assert.deepEqual(saved.objects[0].objects[0].parameters, spec.parameters)
})
