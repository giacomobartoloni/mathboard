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
import { BOARD_OBJECT_TYPES, TRANSFORM_KEYS, TEXT_KEYS, STYLE_KEYS } from '../src/board/objects/constants.js'
import { acceptsSchema } from './helpers/check-discovery-schema.js'
import { validateCreateSpec, validateObjectPatch } from '../src/board/objects/validateCreateSpec.js'
import { normalizeCreateOrigins } from '../src/board/objects/normalizeCreateOrigins.js'

const methods = ['observe', 'create', 'createMany', 'update', 'delete', 'deleteMany', 'clear', 'group', 'measure', 'layout', 'screenshot', 'boards.list', 'boards.create', 'boards.open', 'boards.rename', 'boards.listArchived', 'boards.archive', 'boards.unarchive', 'boards.delete']

test('discovery is detached, deterministic and exposes only executable baseline methods', () => {
  const help = getLocalAgentHelp()
  assert.equal(help.schemaVersion, 1)
  assert.deepEqual(help.methods.map(m => m.method), methods)
  assert.deepEqual(help.objectTypes, [...BOARD_OBJECT_TYPES])
  assert.deepEqual(help.commandEndpoint, { method: 'POST', path: '/__mathboard_agent/command' })
  assert.deepEqual(JSON.parse(JSON.stringify(help)), help)
  assert.ok(JSON.stringify(help).length < 60000, `Help is ${JSON.stringify(help).length} chars`)
  assert.equal(help.safety.localDevelopmentOnly, true)
  assert.equal(help.safety.requireStableBeforeMutation, true)
  assert.ok(help.workflow.join(' ').includes('stable'))
  help.methods[0].paramsSchema.properties.injected = {}
  help.objectTypes.push('arrow')
  assert.deepEqual(getLocalAgentHelp(), getLocalAgentHelp())
  assert.equal(getLocalAgentHelp().methods[0].paramsSchema.properties.injected, undefined)
  assert.ok(getLocalAgentHelp().objectTypes.includes('arrow'))
  for (const name of ['events', 'result', 'constructor', 'toString', '__proto__']) {
    assert.equal(hasLocalAgentMethod(name), false, name)
    assert.throws(() => executeLocalAgentCommand({}, { method: name }), /Unsupported local agent method/)
  }
})

test('each advertised method has actionable metadata for a local tool adapter', () => {
  for (const descriptor of getLocalAgentHelp().methods) {
    assert.equal(hasLocalAgentMethod(descriptor.method), true)
    assert.equal(descriptor.mutatesBoard, !['observe', 'measure', 'screenshot', 'boards.list', 'boards.listArchived'].includes(descriptor.method))
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
  assert.deepEqual(Object.keys(help.patchSchemas.shape.properties), [...TRANSFORM_KEYS, ...STYLE_KEYS, 'mathboardInkMode'])
  assert.deepEqual(Object.keys(help.patchSchemas.text.properties), [...TRANSFORM_KEYS, 'text', ...TEXT_KEYS,
    ...STYLE_KEYS, 'mathboardInkMode'])
  assert.deepEqual(Object.keys(help.patchSchemas.formula.properties), [...TRANSFORM_KEYS, 'latex',
    'fill', 'stroke', 'opacity', 'mathboardInkMode'])
  assert.deepEqual(Object.keys(help.patchSchemas.group.properties), [...TRANSFORM_KEYS, 'opacity'])
  assert.doesNotThrow(() => validateObjectPatch(update.example.params.patch, 'text'))
  for (const kind of ['shape', 'text', 'formula']) {
    assert.doesNotThrow(() => validateObjectPatch({ fill: 'red' }, kind))
    assert.doesNotThrow(() => validateObjectPatch({ left: 200, originX: 'left' }, kind))
  }
  assert.throws(() => validateObjectPatch({ fill: 'red' }, 'group'))
  assert.doesNotThrow(() => validateObjectPatch({ opacity: 0.5 }, 'group'))
  assert.match(help.limitations.join(' '), /path/i)
  assert.match(help.limitations.join(' '), /nested/i)
  assert.match(help.limitations.join(' '), /origin/i)
})


test('history-safe update patch schemas agree with executable bounded validators', () => {
  const help = getLocalAgentHelp()
  const inputs = [
    ['shape', { stroke: '#f00', strokeWidth: 2, strokeDashArray: [4, 3], mathboardInkMode: 'fixed' }],
    ['shape', { fill: null, opacity: 0.4, strokeDashArray: null }],
    ['shape', { strokeWidth: -1 }], ['shape', { opacity: 1.1 }], ['shape', { strokeDashArray: [-1] }],
    ['shape', { strokeLineJoin: 'square' }], ['shape', { mathboardInkMode: 'other' }],
    ['text', { text: 'Color', fill: '#1864ab', opacity: 0.75 }],
    ['formula', { stroke: '#c92a2a', latex: 'x=2' }],
    ['formula', { strokeDashArray: [4, 2] }], ['formula', { opacity: -0.1 }],
    ['group', { opacity: 0.5 }], ['group', { fill: '#fff' }],
  ]
  for (const [kind, sample] of inputs) {
    const accepted = acceptsSchema(help.patchSchemas[kind], sample)
    let runtime = true
    try { validateObjectPatch(sample, kind) } catch { runtime = false }
    assert.equal(accepted, runtime, JSON.stringify({ kind, sample }))
  }
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
    { type: 'arrow', x1: 1, y1: 1, x2: 2, y2: 2 },
    { type: 'arrow', x1: -4, y1: 3, x2: 5, y2: 10, headLength: 0.1 },
    { type: 'arrow', x1: 1, y1: 1, x2: 2 },
    { type: 'arrow', x1: 1, y1: 1, x2: 2, y2: 2, headLength: 0 },
    { type: 'arrow', x1: 1, y1: 1, x2: 2, y2: 2, headWidth: -1 },
    { type: 'arrow', x1: 1, y1: 1, x2: 2, y2: 2, headWidth: null },
    { type: 'ellipse', rx: 35, ry: 12, left: 100, top: 50 },
    { type: 'ellipse', rx: -1, ry: 12 },
    { type: 'ellipse', rx: 12 },
    { type: 'polygon', points: [{ x: -20, y: 10 }, { x: 20, y: 10 }, { x: 0, y: 35 }] },
    { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 20 }] },
    { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30 }] },
    { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: '30', y: 10 }] },
    { type: 'polygon', points: Array.from({ length: 1001 }, () => ({ x: 0, y: 0 })) },
    { type: 'group', objects: [{ type: 'ellipse' }] },
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


test('discovery creation defaults match recursive F014 origin normalization without changing update schemas', () => {
  const help = getLocalAgentHelp()
  for (const method of ['create', 'createMany']) {
    const params = help.methods.find(entry => entry.method === method).paramsSchema
    for (const schema of params.$defs.createSpec.oneOf) {
      assert.equal(schema.properties.originX.default, 'left', schema.properties.type.const)
      assert.equal(schema.properties.originY.default, 'top', schema.properties.type.const)
    }
  }
  assert.equal(help.patchSchemas.shape.properties.originX.default, undefined)
  assert.equal(help.patchSchemas.shape.properties.originY.default, undefined)
  const group = { type: 'group', objects: [
    { type: 'formula', latex: 'x=2', left: 100, top: 200 },
    { type: 'rect', width: 20, height: 40, originX: 0.25, originY: 'center' },
    { type: 'group', objects: [{ type: 'text', text: 'Nested' }] },
  ] }
  const normalized = normalizeCreateOrigins(group)
  assert.equal(group.originX, undefined)
  assert.equal(normalized.originX, 'left')
  assert.equal(normalized.originY, 'top')
  assert.equal(normalized.objects[0].originX, 'left')
  assert.equal(normalized.objects[0].originY, 'top')
  assert.equal(normalized.objects[1].originX, 0.25)
  assert.equal(normalized.objects[1].originY, 'center')
  assert.equal(normalized.objects[2].objects[0].originX, 'left')
  assert.equal(normalized.objects[2].objects[0].originY, 'top')
  const line = normalizeCreateOrigins({ type: 'line', x1: 10, y1: 20, x2: 40, y2: 50 })
  assert.equal(line.left, undefined)
  assert.equal(line.top, undefined)
  assert.match(help.limitations.join(' '), /default omitted origins to left\/top/)
})

test('F015 discovery has executable deleteMany/clear closures with atomic semantics and no schema drift', async () => {
  const help = getLocalAgentHelp()
  const bulk = help.methods.find(method => method.method === 'deleteMany')
  const clear = help.methods.find(method => method.method === 'clear')
  assert.equal(bulk.mutatesBoard, true)
  assert.equal(bulk.requiresStable, true)
  assert.deepEqual(bulk.paramsSchema.required, ['ids'])
  assert.equal(bulk.paramsSchema.properties.ids.type, 'array')
  assert.equal(bulk.paramsSchema.properties.ids.uniqueItems, true)
  assert.equal(bulk.paramsSchema.properties.ids.items.minLength, 1)
  assert.equal(bulk.resultSchema.type, 'array')
  assert.equal(clear.mutatesBoard, true)
  assert.equal(clear.requiresStable, true)
  assert.deepEqual(clear.paramsSchema.required, [])
  assert.equal(clear.resultSchema.type, 'array')
  assert.ok(help.limitations.some(line => line.includes('deleteMany') && line.includes('no-ops')))
  const calls = []
  const controller = {
    deleteMany(ids) { calls.push({ method: 'deleteMany', ids }); return [{ id: ids[0] }] },
    clear() { calls.push({ method: 'clear' }); return [] },
  }
  assert.deepEqual(await executeLocalAgentCommand(controller, bulk.example), [{ id: 'mbobj_example_a' }])
  assert.deepEqual(await executeLocalAgentCommand(controller, clear.example), [])
  assert.deepEqual(calls, [
    { method: 'deleteMany', ids: ['mbobj_example_a', 'mbobj_example_b'] },
    { method: 'clear' },
  ])
  assert.equal(hasLocalAgentMethod('deleteMany'), true)
  assert.equal(hasLocalAgentMethod('clear'), true)
})

test('F016 discovery exposes group as one explicitly approved retained mutation with bounded IDs', async () => {
  const help = getLocalAgentHelp()
  const descriptor = help.methods.find(item => item.method === 'group')
  assert.equal(descriptor.mutatesBoard, true)
  assert.equal(descriptor.requiresStable, true)
  assert.deepEqual(descriptor.paramsSchema.required, ['ids'])
  assert.equal(descriptor.paramsSchema.properties.ids.type, 'array')
  assert.equal(descriptor.paramsSchema.properties.ids.minItems, 2)
  assert.equal(descriptor.paramsSchema.properties.ids.uniqueItems, true)
  assert.equal(descriptor.paramsSchema.properties.ids.items.minLength, 1)
  assert.equal(descriptor.paramsSchema.properties.options.properties.select.type, 'boolean')
  assert.equal(descriptor.resultSchema.required.includes('id'), true)
  assert.ok(help.limitations.some(line => line.includes('group requires') && line.includes('Board Groups')))
  const calls = []
  const controller = { group(ids, options) { calls.push({ ids, options }); return { id: 'mbgroup_example', type: 'group' } } }
  assert.deepEqual(await executeLocalAgentCommand(controller, descriptor.example),
    { id: 'mbgroup_example', type: 'group' })
  assert.deepEqual(calls, [{ ids: ['mbobj_example_a', 'mbobj_example_b'], options: { select: false } }])
  assert.equal(hasLocalAgentMethod('group'), true)
})

test('F018 read-only measure and mutating layout use explicit registry closures', async () => {
  const help = getLocalAgentHelp()
  const measure = help.methods.find(x => x.method === 'measure')
  const layout = help.methods.find(x => x.method === 'layout')
  assert.equal(measure.mutatesBoard, false)
  assert.equal(measure.requiresStable, false)
  assert.deepEqual(measure.paramsSchema.required, ['id'])
  assert.deepEqual(measure.resultSchema.required, ['id', 'left', 'top', 'width', 'height'])
  assert.equal(layout.mutatesBoard, true)
  assert.equal(layout.requiresStable, true)
  assert.deepEqual(layout.paramsSchema.required, ['ids'])
  assert.equal(layout.paramsSchema.properties.ids.minItems, 1)
  assert.equal(layout.paramsSchema.properties.ids.uniqueItems, true)
  assert.deepEqual(layout.paramsSchema.properties.direction.enum, ['stack', 'row'])
  assert.equal(layout.paramsSchema.properties.gap.default, 24)
  assert.equal(layout.paramsSchema.properties.margin.default, 16)
  const calls = []
  const controller = {
    measure(id) { calls.push(['measure', id]); return { id, left: 1, top: 2, width: 3, height: 4 } },
    layout(opts) { calls.push(['layout', opts]); return { objects: [], bounds: {}, safeArea: {} } },
  }
  assert.equal((await executeLocalAgentCommand(controller, measure.example)).id, 'mbobj_example')
  assert.deepEqual(await executeLocalAgentCommand(controller, layout.example), { objects: [], bounds: {}, safeArea: {} })
  assert.deepEqual(calls, [['measure', 'mbobj_example'], ['layout', layout.example.params]])
})
