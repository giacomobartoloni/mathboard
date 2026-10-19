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
import { getLocalAgentHelp, hasLocalAgentMethod, executeLocalAgentCommand } from '../dev-agent/command-contract.js'
import { BOARD_OBJECT_TYPES, TRANSFORM_KEYS, TEXT_KEYS } from '../src/board/objects/constants.js'
import { acceptsSchema } from './helpers/check-discovery-schema.js'
import { validateCreateSpec, validateObjectPatch } from '../src/board/objects/validateCreateSpec.js'

const methods = ['observe', 'create', 'createMany', 'update', 'delete', 'screenshot']

test('discovery is detached, deterministic and exposes only executable baseline methods', () => {
  const help = getLocalAgentHelp()
  assert.equal(help.schemaVersion, 1)
  assert.deepEqual(help.methods.map(m => m.method), methods)
  assert.deepEqual(help.objectTypes, [...BOARD_OBJECT_TYPES])
  assert.deepEqual(help.commandEndpoint, { method: 'POST', path: '/__mathboard_agent/command' })
  assert.deepEqual(JSON.parse(JSON.stringify(help)), help)
  assert.ok(JSON.stringify(help).length < 60000)
  assert.equal(help.safety.localDevelopmentOnly, true)
  assert.equal(help.safety.requireStableBeforeMutation, true)
  assert.ok(help.workflow.join(' ').includes('stable'))
  help.methods[0].paramsSchema.properties.injected = {}
  help.objectTypes.push('arrow')
  assert.deepEqual(getLocalAgentHelp(), getLocalAgentHelp())
  assert.equal(getLocalAgentHelp().methods[0].paramsSchema.properties.injected, undefined)
  assert.ok(!getLocalAgentHelp().objectTypes.includes('arrow'))
  for (const name of ['clear', 'deleteMany', 'group', 'layout', 'measure', 'events', 'result', 'constructor', 'toString', '__proto__']) {
    assert.equal(hasLocalAgentMethod(name), false, name)
    assert.throws(() => executeLocalAgentCommand({}, { method: name }), /Unsupported local agent method/)
  }
})

test('each advertised method has actionable metadata for a local tool adapter', () => {
  for (const descriptor of getLocalAgentHelp().methods) {
    assert.equal(hasLocalAgentMethod(descriptor.method), true)
    assert.equal(descriptor.mutatesBoard, !['observe', 'screenshot'].includes(descriptor.method))
    assert.equal(descriptor.requiresStable, descriptor.mutatesBoard || descriptor.method === 'screenshot')
    assert.ok(descriptor.summary.length > 10)
    assert.equal(descriptor.paramsSchema.type, 'object')
    assert.ok(descriptor.resultSchema.type)
    assert.ok(descriptor.errors.some(e => e.status === 409))
    assert.equal(descriptor.example.method, descriptor.method)
    assert.ok(!('execute' in descriptor))

  }
})

test('create inventory, schemas and synthetic examples agree with real validators', () => {
  const help = getLocalAgentHelp()
  const create = help.methods.find(m => m.method === 'create')
  const defs = create.paramsSchema.$defs
  assert.deepEqual(defs.createSpec.oneOf.map(s => s.properties.type.const), [...BOARD_OBJECT_TYPES])
  for (const shape of defs.createSpec.oneOf) {
    assert.equal(shape.additionalProperties, false)
    assert.equal(shape.required[0], 'type')
    const sample = help.examplesByType[shape.properties.type.const]
    assert.doesNotThrow(() => validateCreateSpec(sample))
    assert.throws(() => validateCreateSpec({ ...sample, bogus: 1 }))
    assert.ok(shape.required.every(key => key in sample))
  }
  for (const d of help.methods) {
    if (d.method === 'create') assert.doesNotThrow(() => validateCreateSpec(d.example.params.spec))
    if (d.method === 'createMany') d.example.params.specs.forEach(s => validateCreateSpec(s))
  }
  const update = help.methods.find(m => m.method === 'update')
  assert.deepEqual(Object.keys(help.patchSchemas.shape.properties), [...TRANSFORM_KEYS])
  assert.deepEqual(Object.keys(help.patchSchemas.text.properties), [...TRANSFORM_KEYS, 'text', ...TEXT_KEYS])
  assert.deepEqual(Object.keys(help.patchSchemas.formula.properties), [...TRANSFORM_KEYS, 'latex'])
  assert.doesNotThrow(() => validateObjectPatch(update.example.params.patch, 'text'))
  for (const kind of ['shape', 'text', 'formula', 'group']) {
    assert.throws(() => validateObjectPatch({ fill: 'red' }, kind))
    assert.doesNotThrow(() => validateObjectPatch({ left: 200, originX: 'left' }, kind))
  }
  assert.match(help.limitations.join(' '), /path/i)
  assert.match(help.limitations.join(' '), /nested/i)
  assert.match(help.limitations.join(' '), /origin/i)
})


test('representative accepted and rejected creation/patch inputs agree with published JSON schemas', () => {
  const help = getLocalAgentHelp()
  const createSchema = help.methods.find(m => m.method === 'create').paramsSchema
  for (const sample of [
    ...Object.values(help.examplesByType),
    { type: 'text', text: '', fontSize: 22, fontWeight: 500, originX: 0.25, underline: true },
    { type: 'formula', latex: '\\frac{1}{2}', originY: 'bottom', fill: null },
    { type: 'group', objects: [{ type: 'group', objects: [{ type: 'formula', latex: 'x=1' }] }] },
    { type: 'rect', fill: null, strokeDashArray: [1, 2], mathboardInkMode: 'fixed' },
    { type: 'formula', latex: '   ' }, { type: 'text' }, { type: 'text', text: 3 },
    { type: 'rect', originX: 'top' }, { type: 'rect', left: '20' },
    { type: 'rect', strokeDashArray: ['bad'] }, { type: 'circle', bogus: 1 },
    { type: 'arrow', x1: 1, y1: 1, x2: 2, y2: 2 }, { type: 'group', objects: [{ type: 'ellipse' }] },
  ]) {
    let valid = true
    try { validateCreateSpec(sample) } catch { valid = false }
    assert.equal(acceptsSchema(createSchema, { spec: sample }), valid, JSON.stringify(sample))
  }
  for (const kind of ['shape', 'text', 'formula', 'group']) {
    for (const patch of [{}, { left: 0 }, { originX: 0.3, flipY: true }, { left: '20' },
      { text: '' }, { latex: 'x=3' }, { latex: ' ' }, { fontWeight: 500 }, { fill: 'red' }]) {
      let valid = true
      try { validateObjectPatch(patch, kind) } catch { valid = false }
      assert.equal(acceptsSchema(help.patchSchemas[kind], patch), valid, `${kind}:${JSON.stringify(patch)}`)
    }
  }
})


test('screenshot discovery is a read-only executable closure with exact capture metadata', async () => {
  const descriptor = getLocalAgentHelp().methods.find(item => item.method === 'screenshot')
  assert.equal(descriptor.mutatesBoard, false)
  assert.equal(descriptor.requiresStable, true)
  assert.equal(descriptor.paramsSchema.required.includes('target'), true)
  assert.deepEqual(descriptor.paramsSchema.properties.target.oneOf.map(x => x.properties.kind.const),
    ['sceneRect', 'objectIds', 'viewport'])
  assert.equal(descriptor.resultSchema.properties.mimeType.const, 'image/png')
  assert.equal(descriptor.resultSchema.properties.encoding.const, 'base64')
  assert.equal(descriptor.errors.some(x => x.codes?.includes('capture_too_large')), true)
  let called = 0
  const capture = { screenshot: async params => { called++; return { region: params.target.kind } } }
  assert.deepEqual(await executeLocalAgentCommand({}, descriptor.example, capture), { region: 'sceneRect' })
  assert.equal(called, 1)
})
