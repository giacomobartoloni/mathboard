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

import { BOARD_OBJECT_TYPES, TRANSFORM_KEYS, TEXT_KEYS, STYLE_KEYS } from '../src/board/objects/constants.js'
import { getScreenshotDescriptor } from './capture/discovery.js'

const number = { type: 'number' }
const string = { type: 'string' }
const boolean = { type: 'boolean' }
const nullablePaint = { type: ['string', 'null'] }
const nonempty = { type: 'string', minLength: 1 }
const latex = { type: 'string', pattern: '\\S' }
const origin = (names) => ({ anyOf: [{ type: 'string', enum: names }, number] })
const transformProperties = Object.fromEntries(TRANSFORM_KEYS.map(key => [key,
  key === 'originX' ? origin(['left', 'center', 'right'])
    : key === 'originY' ? origin(['top', 'center', 'bottom'])
      : key === 'flipX' || key === 'flipY' ? boolean : number,
]))
const textProperties = Object.fromEntries(TEXT_KEYS.map(key => [key,
  ['fontSize', 'lineHeight', 'charSpacing'].includes(key) ? number
    : ['underline', 'linethrough', 'overline'].includes(key) ? boolean
      : key === 'fontWeight' ? { anyOf: [string, number] } : string,
]))
const styleProperties = Object.fromEntries(STYLE_KEYS.map(key => [key,
  ['strokeWidth', 'opacity'].includes(key) ? number
    : key === 'strokeDashArray' ? { type: ['array', 'null'], items: number } : nullablePaint,
]))
const objectSchema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const common = { type: string, id: { description: 'Ignored on create: fresh semantic IDs are assigned.' },
  ...transformProperties,
  originX: { ...transformProperties.originX, default: 'left', description: 'New programmable creations default to left when omitted, including group children; explicit named or numeric origins are preserved.' },
  originY: { ...transformProperties.originY, default: 'top', description: 'New programmable creations default to top when omitted, including group children; explicit named or numeric origins are preserved.' },
  ...styleProperties, mathboardInkMode: { enum: ['auto', 'fixed'] } }
const typeFields = {
  rect: { width: number, height: number, rx: number, ry: number },
  circle: { radius: number },
  ellipse: { rx: { type: 'number', minimum: 0 }, ry: { type: 'number', minimum: 0 } },
  polygon: { points: { type: 'array', minItems: 3, maxItems: 1000,
    items: { type: 'object', properties: { x: number, y: number }, required: ['x', 'y'] } } },
  line: { x1: number, y1: number, x2: number, y2: number },
  path: { path: { type: 'array', description: 'Permissive Fabric path-command data; rendering can still reject invalid contents.', items: {} } },
  text: { text: string, ...textProperties },
  formula: { latex },
  group: { objects: { type: 'array', items: { $ref: '#/$defs/createSpec' } } },
}
const requiredFields = { rect: [], circle: [], ellipse: ['rx', 'ry'], polygon: ['points'], line: ['x1', 'y1', 'x2', 'y2'],
  path: ['path'], text: ['text'], formula: ['latex'], group: ['objects'] }
const createSpec = { oneOf: BOARD_OBJECT_TYPES.map(type => {
  if (!typeFields[type]) throw new Error(`Missing local discovery schema for ${type}`)
  return objectSchema({ ...common, type: { const: type }, ...typeFields[type] }, ['type', ...requiredFields[type]])
}) }
const patchSchemas = {
  shape: objectSchema({ ...transformProperties }),
  text: objectSchema({ ...transformProperties, text: string, ...textProperties }),
  formula: objectSchema({ ...transformProperties, latex }),
  group: objectSchema({ ...transformProperties }),
}
const options = { type: 'object', properties: { select: boolean }, additionalProperties: true,
  description: 'Optional selection request; use select:true/false. Other options are ignored. Selection on update applies to formula replacement only.' }
const node = { type: 'object', required: ['id', 'type'], properties: { id: nonempty, type: { enum: [...BOARD_OBJECT_TYPES] } },
  additionalProperties: true, description: 'Detached semantic node, with type-specific geometry, transforms and ink metadata. Formula retains LaTeX, not internal vector paths.' }
const errors = [
  { status: 400, codes: ['invalid_command'], description: 'Malformed envelope/JSON or unsupported method.' },
  { status: 409, codes: ['board_not_ready', 'invalid_object_spec', 'invalid_object_patch', 'object_not_found',
    'nested_object_mutation_not_supported', 'formula_render_failed', 'board_commit_failed', 'local_agent_bridge_error'],
  description: 'Board/domain rejection; inspect the returned code and re-observe before retrying.' },
  { status: 503, codes: ['board_unavailable', 'board_disconnected'], description: 'No connected browser, or browser disconnected. Re-observe after reconnecting.' },
  { status: 504, codes: ['command_timeout'], description: 'Delivery outcome may be uncertain; re-observe before any mutation retry.' },
]
const params = (properties, required = [], defs) => ({ type: 'object', properties, required, additionalProperties: true,
  description: 'Command params object; unrecognized envelope parameters are ignored by the existing adapter.',
  ...(defs ? { $defs: defs } : {}) })
const descriptors = [
  { method: 'observe', summary: 'Read semantic objects, selection, viewport and interaction stability.', mutatesBoard: false,
    paramsSchema: params({}), resultSchema: { type: 'object', required: ['stable', 'objects', 'selection', 'viewport'],
      properties: { stable: boolean, objects: { type: 'array', items: node }, selection: { type: 'object' },
        viewport: { type: 'object' }, boardId: { type: ['string', 'null'] }, version: { type: 'integer' } } },
    example: { method: 'observe', params: {} }, execute: controller => controller.observe() },
  { method: 'create', summary: 'Create one semantic object with fresh identity and one history command.', mutatesBoard: true,
    paramsSchema: params({ spec: { $ref: '#/$defs/createSpec' }, options }, ['spec'], { createSpec }), resultSchema: node,
    example: { method: 'create', params: { spec: { type: 'text', text: 'Synthetic example', left: 240, top: 160,
      originX: 'left', originY: 'top' }, options: { select: false } } },
    execute: (controller, p) => controller.create(p.spec, p.options) },
  { method: 'createMany', summary: 'Create a nonempty batch atomically with one Undo command.', mutatesBoard: true,
    paramsSchema: params({ specs: { type: 'array', minItems: 1, items: { $ref: '#/$defs/createSpec' } }, options }, ['specs'], { createSpec }),
    resultSchema: { type: 'array', items: node }, example: { method: 'createMany', params: { specs: [
      { type: 'text', text: 'Synthetic equation', left: 240, top: 160, originX: 'left', originY: 'top' },
      { type: 'formula', latex: 'x^2=4', left: 240, top: 240, originX: 'left', originY: 'top' },
    ] } }, execute: (controller, p) => controller.createMany(p.specs, p.options) },
  { method: 'update', summary: 'Update transforms, text or LaTeX on one existing top-level object.', mutatesBoard: true,
    paramsSchema: params({ id: nonempty, patch: { anyOf: Object.values(patchSchemas),
      description: 'Type-dependent union: use patchSchemas for the observed semantic type. Style/ink/geometry patches are not supported in this build.' }, options }, ['id', 'patch']),
    resultSchema: node, example: { method: 'update', params: { id: 'mbobj_example', patch: { left: 320, top: 200 } } },
    execute: (controller, p) => controller.update(p.id, p.patch, p.options) },
  { method: 'delete', summary: 'Remove one top-level semantic object with one Undo command.', mutatesBoard: true,
    paramsSchema: params({ id: nonempty }, ['id']), resultSchema: node,
    example: { method: 'delete', params: { id: 'mbobj_example' } }, execute: (controller, p) => controller.delete(p.id) },
  { method: 'deleteMany', summary: 'Remove unique existing top-level IDs atomically with one Undo; empty IDs do nothing.', mutatesBoard: true,
    paramsSchema: params({ ids: { type: 'array', items: nonempty, uniqueItems: true,
      description: 'Unique IDs of top-level semantic objects. Unknown or nested IDs reject the entire batch without changes.' } }, ['ids']),
    resultSchema: { type: 'array', items: node, description: 'Removed semantic nodes in original canvas z-order.' },
    example: { method: 'deleteMany', params: { ids: ['mbobj_example_a', 'mbobj_example_b'] } },
    execute: (controller, p) => controller.deleteMany(p.ids) },
  { method: 'clear', summary: 'Atomically remove all top-level board objects with one Undo; empty board is a no-op.', mutatesBoard: true,
    paramsSchema: params({}), resultSchema: { type: 'array', items: node,
      description: 'All removed semantic nodes in original canvas z-order.' },
    example: { method: 'clear', params: {} }, execute: controller => controller.clear() },
  { method: 'group', summary: 'Combine at least two distinct top-level groupable objects in one retained Board Group and Undo step.', mutatesBoard: true,
    paramsSchema: params({ ids: { type: 'array', items: nonempty, minItems: 2, uniqueItems: true,
      description: 'At least two unique top-level groupable IDs. Existing Board Groups and nested children are not supported.' },
      options }, ['ids']),
    resultSchema: node,
    example: { method: 'group', params: { ids: ['mbobj_example_a', 'mbobj_example_b'], options: { select: false } } },
    execute: (controller, p) => controller.group(p.ids, p.options) },

  { method: 'measure', summary: 'Read detached scene bounds for one existing top-level object.', mutatesBoard: false, requiresStable: false,
    paramsSchema: params({ id: nonempty }, ['id']),
    resultSchema: { type: 'object', required: ['id', 'left', 'top', 'width', 'height'], additionalProperties: false,
      properties: { id: nonempty, left: number, top: number, width: number, height: number } },
    example: { method: 'measure', params: { id: 'mbobj_example' } },
    execute: (controller, p) => controller.measure(p.id) },
  { method: 'layout', summary: 'Arrange ordered top-level objects in a measured stack or row within the visible workspace safe area.', mutatesBoard: true, requiresStable: true,
    paramsSchema: params({ ids: { type: 'array', minItems: 1, uniqueItems: true, items: nonempty,
        description: 'Ordered top-level IDs; nested IDs are unsupported.' },
      direction: { type: 'string', enum: ['stack', 'row'], default: 'stack' },
      gap: { type: 'number', minimum: 0, default: 24, description: 'Scene units.' },
      margin: { type: 'number', minimum: 0, default: 16, description: 'Viewport CSS pixels.' },
      left: { type: 'number', description: 'Optional scene-space left coordinate.' },
      top: { type: 'number', description: 'Optional scene-space top coordinate.' } }, ['ids']),
    resultSchema: { type: 'object', required: ['objects', 'bounds', 'safeArea'],
      properties: { objects: { type: 'array', items: node },
        bounds: { type: 'object', required: ['left', 'top', 'width', 'height'],
          properties: { left: number, top: number, width: number, height: number } },
        safeArea: { type: 'object', required: ['left', 'top', 'width', 'height'],
          properties: { left: number, top: number, width: number, height: number } } } },
    example: { method: 'layout', params: { ids: ['mbobj_example_a', 'mbobj_example_b'], direction: 'stack', gap: 24, margin: 16 } },
    execute: (controller, p) => controller.layout(p) },
  { ...getScreenshotDescriptor(), execute: (_controller, p, capture) => capture.screenshot(p) },
]

export function hasLocalAgentMethod(method) {
  return descriptors.some(entry => entry.method === method)
}

/** Explicit closures are the only callable surface; never look up arbitrary controller methods. */
export function localAgentMethodMutatesBoard(method) {
  return descriptors.find(entry => entry.method === method)?.mutatesBoard ?? false
}

export function executeLocalAgentCommand(controller, command, capture) {
  const entry = descriptors.find(candidate => candidate.method === command?.method)
  if (!entry) throw new Error(`Unsupported local agent method: ${command?.method}`)
  return entry.execute(controller, command.params || {}, capture)
}

/** Detached metadata only: this function never observes or accesses a board. */
export function getLocalAgentHelp() {
  return structuredClone({
    schemaVersion: 1,
    transport: 'local-agent-vite-bridge',
    commandEndpoint: { method: 'POST', path: '/__mathboard_agent/command' },
    healthEndpoint: { method: 'GET', path: '/__mathboard_agent/health' },
    schemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    methods: descriptors.map(({ execute, ...metadata }) => {
      void execute
      return { ...metadata, requiresStable: metadata.requiresStable ?? metadata.mutatesBoard,
        errors: metadata.errors ?? errors, successStatus: metadata.successStatus ?? 200 }
    }),
    objectTypes: [...BOARD_OBJECT_TYPES], patchSchemas,
    examplesByType: {
      rect: { type: 'rect', width: 80, height: 50, fill: null },
      circle: { type: 'circle', radius: 30 },
      ellipse: { type: 'ellipse', rx: 70, ry: 45, fill: null },
      polygon: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 90 }], fill: null },
      line: { type: 'line', x1: 200, y1: 200, x2: 300, y2: 250 },
      path: { type: 'path', path: [['M', 200, 200], ['L', 300, 250]], fill: null },
      text: { type: 'text', text: 'Synthetic title' },
      formula: { type: 'formula', latex: 'x=2' },
      group: { type: 'group', objects: [{ type: 'rect', width: 40, height: 40 }] },
    },
    workflow: [
      'Check health.browserConnected (transport only); open one local browser tab if disconnected.',
      'Call observe and wait for result.stable === true before mutation.',
      'Obtain human authorization appropriate to the mutation; discovering a method does not authorize it.',
      'Send method and params to commandEndpoint, then observe to verify the result.',
      'deleteMany and clear are all-or-nothing history mutations; the human Undo/Redo UI reverses each nonempty call in one step.',
      'group joins at least two already-created top-level groupable IDs; it preserves child IDs and creates a new retained group ID with one Undo.',
      'measure reports a top-level object scene AABB; layout stacks/rows ordered top-level IDs with one Undo for effective changes.',
      'Use the read-only screenshot method to inspect canvas pixels; decode its base64 PNG as an image in a multimodal host.',
      'On timeout/disconnect, re-observe after reconnecting before deciding whether to retry a mutation.',
    ],
    safety: { localDevelopmentOnly: true, loopbackHost: '127.0.0.1', requireStableBeforeMutation: true,
      discoveryGrantsAuthorization: false, containsBoardData: false },
    limitations: [
      'Only commands in methods are executable in this build; planned operations are absent.',
      'Mutations address top-level IDs only; nested group children cannot be mutated directly. deleteMany rejects duplicate, unknown or nested IDs atomically; [] and empty-board clear are history-preserving no-ops.',
      'group requires at least two unique existing top-level groupable IDs, refuses existing Board Groups and nested IDs, preserves child geometry, and places the new group in front. Ungroup and Undo/Redo remain UI actions.',
      'measure is read-only. layout uses scene units for gap/left/top and CSS pixels for margin, rejects nested IDs/overflow without mutation, preserves no-op Redo and history.',
      'Coordinates are scene units, independent of viewport pan/zoom. New programmable create/createMany default omitted origins to left/top recursively; explicit named/numeric origins are preserved. Existing documents, Stamps and UI creation are unchanged.',
      'Create IDs are regenerated, including group children. Group children use existing Fabric-local geometry; formulas remain atomic/editable.',
      'Update schema is a type-dependent union, not permission to apply text/LaTeX fields to every object; style/ink updates reject.',
      'Path items are intentionally permissive schema data; materialization may reject malformed path commands.',
      'Examples are synthetic templates. Replace mbobj_example with an observed existing ID. Discovery performs no permission enforcement.',
      'Undo/Redo are UI actions, not bridge methods. Normal dev/production builds do not expose this bridge.',
      'Screenshot exports only canvas pixels, not toolbars or DOM overlays; follow its own limits, stable-board requirement and safety guidance.',
    ],
  })
}
