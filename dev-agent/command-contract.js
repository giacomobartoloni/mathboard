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
const common = { type: string, id: { description: 'New ID is assigned.' },
  ...transformProperties,
  originX: { ...transformProperties.originX, default: 'left', description: 'Defaults left; explicit wins.' },
  originY: { ...transformProperties.originY, default: 'top', description: 'Defaults top; explicit wins.' },
  ...styleProperties, mathboardInkMode: { enum: ['auto', 'fixed'] } }
const typeFields = {
  rect: { width: number, height: number, rx: number, ry: number },
  circle: { radius: number },
  ellipse: { rx: { type: 'number', minimum: 0 }, ry: { type: 'number', minimum: 0 } },
  polygon: { points: { type: 'array', minItems: 3, maxItems: 1000,
    items: { type: 'object', properties: { x: number, y: number }, required: ['x', 'y'] } } },
  arrow: { x1: number, y1: number, x2: number, y2: number,
    headLength: { type: 'number', exclusiveMinimum: 0, default: 16 },
    headWidth: { type: 'number', exclusiveMinimum: 0, default: 12 } },
  line: { x1: number, y1: number, x2: number, y2: number },
  path: { path: { type: 'array', description: 'Permissive Fabric path-command data; rendering can still reject invalid contents.', items: {} } },
  text: { text: string, ...textProperties },
  formula: { latex },
  group: { objects: { type: 'array', items: { $ref: '#/$defs/createSpec' } } },
}
const requiredFields = { rect: [], circle: [], ellipse: ['rx', 'ry'], polygon: ['points'], arrow: ['x1', 'y1', 'x2', 'y2'], line: ['x1', 'y1', 'x2', 'y2'],
  path: ['path'], text: ['text'], formula: ['latex'], group: ['objects'] }
const createSpec = { oneOf: BOARD_OBJECT_TYPES.map(type => {
  if (!typeFields[type]) throw new Error(`Missing local discovery schema for ${type}`)
  return objectSchema({ ...common, type: { const: type }, ...typeFields[type] }, ['type', ...requiredFields[type]])
}) }
const nonnegative = { type: 'number', minimum: 0 }
const stylePatchProperties = {
  stroke: nullablePaint, fill: nullablePaint, strokeWidth: nonnegative,
  opacity: { type: 'number', minimum: 0, maximum: 1 },
  strokeDashArray: { type: ['array', 'null'], items: nonnegative },
  strokeLineCap: { enum: ['butt', 'round', 'square'] },
  strokeLineJoin: { enum: ['bevel', 'round', 'miter'] },
  mathboardInkMode: { enum: ['auto', 'fixed'] },
}
const formulaPaint = { type: 'string', minLength: 1, pattern: '\\S',
  description: 'Nonempty painted ink; none/transparent is rejected at runtime.' }
const patchSchemas = {
  shape: objectSchema({ ...transformProperties, ...stylePatchProperties }),
  text: objectSchema({ ...transformProperties, text: string, ...textProperties, ...stylePatchProperties }),
  formula: objectSchema({ ...transformProperties, latex, fill: formulaPaint, stroke: formulaPaint,
    opacity: stylePatchProperties.opacity, mathboardInkMode: stylePatchProperties.mathboardInkMode }),
  group: objectSchema({ ...transformProperties, opacity: stylePatchProperties.opacity }),
}
const options = { type: 'object', properties: { select: boolean }, additionalProperties: true,
  description: 'Optional selection request; use select:true/false. Other options are ignored. Selection on update applies to formula replacement only.' }
const node = { type: 'object', required: ['id', 'type'], properties: { id: nonempty, type: { enum: [...BOARD_OBJECT_TYPES] } },
  additionalProperties: true, description: 'Detached semantic node, with type-specific geometry, transforms and ink metadata. Formula retains LaTeX, not internal vector paths.' }
const errors = [
  { status: 400, codes: ['invalid_command'], description: 'Invalid method or JSON.' },
  { status: 409, codes: ['board_not_ready', 'invalid_object_spec', 'invalid_object_patch', 'object_not_found',
    'nested_object_mutation_not_supported', 'formula_render_failed', 'board_commit_failed', 'local_agent_bridge_error'],
  description: 'Board/domain rejected; re-observe.' },
  { status: 503, codes: ['board_unavailable', 'board_disconnected'], description: 'Browser unavailable; reconnect.' },
  { status: 504, codes: ['command_timeout'], description: 'Timeout; observe before retry.' },
]
const libraryErrors = [
  { status: 400, codes: ['invalid_command'] },
  { status: 409, codes: ['board_not_found', 'board_trashed', 'board_not_trashed', 'invalid_board_title', 'edit_in_progress'] },
  { status: 503, codes: ['board_unavailable', 'board_disconnected'] },
  { status: 504, codes: ['command_timeout'] },
]
const params = (properties, required = [], defs) => ({ type: 'object', properties, required, additionalProperties: true,
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
  { method: 'update', summary: 'Update transforms, text, LaTeX or history-safe style on one top-level object.', mutatesBoard: true,
    paramsSchema: params({ id: nonempty, patch: { anyOf: Object.values(patchSchemas),
      description: 'Type-dependent union. Use patchSchemas by observed kind; styles are bounded, intrinsic geometry rejected.' }, options }, ['id', 'patch']),
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
  { method: 'boards.list', summary: 'List this browser origin local board records, without exposing document objects.', mutatesBoard: false,
    errors: libraryErrors,
    paramsSchema: params({}),
    resultSchema: { type: 'array', items: { type: 'object', required: ['id', 'title', 'kind', 'isActive'] } },
    example: { method: 'boards.list', params: {} },
    execute: (_controller, _p, _capture, workspace) => workspace.list() },
  { method: 'boards.create', summary: 'Create and activate a new local scratch board after safely saving the old board.', mutatesBoard: true,
    errors: libraryErrors,
    paramsSchema: params({ title: { type: 'string', minLength: 1, maxLength: 120 } }),
    resultSchema: { type: 'object', required: ['id', 'title', 'kind', 'isActive'] },
    example: { method: 'boards.create', params: { title: 'Algebra lesson' } },
    execute: (_controller, p, _capture, workspace) => workspace.create(p) },
  { method: 'boards.open', summary: 'Open a stored local board; validates and resets in-memory history.', mutatesBoard: true,
    errors: libraryErrors,
    paramsSchema: params({ boardId: nonempty }, ['boardId']),
    resultSchema: { type: 'object', required: ['id', 'title', 'kind', 'isActive'] },
    example: { method: 'boards.open', params: { boardId: 'mb_example' } },
    execute: (_controller, p, _capture, workspace) => workspace.open(p) },
  { method: 'boards.rename', summary: 'Rename local board metadata and its saved semantic document.', mutatesBoard: true,
    errors: libraryErrors,
    paramsSchema: params({ boardId: nonempty, title: { type: 'string', minLength: 1, maxLength: 120 } }, ['boardId', 'title']),
    resultSchema: { type: 'object', required: ['id', 'title', 'kind', 'isActive'] },
    example: { method: 'boards.rename', params: { boardId: 'mb_example', title: 'Quadratics' } },
    execute: (_controller, p, _capture, workspace) => workspace.rename(p) },
  { method: 'boards.listTrash', summary: 'List recoverable trashed local board metadata.', mutatesBoard: false,
    errors: libraryErrors,
    paramsSchema: params({}), resultSchema: { type: 'array', items: { type: 'object', required: ['id', 'title', 'trashedAt'] } },
    example: { method: 'boards.listTrash', params: {} },
    execute: (_controller, _p, _capture, workspace) => workspace.listTrash() },
  { method: 'boards.trash', summary: 'Move a board to the recoverable trash; opens a fresh board if active.', mutatesBoard: true,
    errors: libraryErrors,
    paramsSchema: params({ boardId: nonempty }, ['boardId']),
    resultSchema: { type: 'object', required: ['id', 'trashedAt'] },
    example: { method: 'boards.trash', params: { boardId: 'mb_example' } },
    execute: (_controller, p, _capture, workspace) => workspace.trash(p) },
  { method: 'boards.restore', summary: 'Restore a board from trash to the local library.', mutatesBoard: true,
    errors: libraryErrors,
    paramsSchema: params({ boardId: nonempty }, ['boardId']),
    resultSchema: { type: 'object', required: ['id', 'title'] },
    example: { method: 'boards.restore', params: { boardId: 'mb_example' } },
    execute: (_controller, p, _capture, workspace) => workspace.restore(p) },
  { method: 'boards.save', summary: 'Flush the active board and retain it as a saved library item.', mutatesBoard: true,
    errors: libraryErrors,
    paramsSchema: params({}),
    resultSchema: { type: 'object', required: ['id', 'title', 'kind', 'isActive'] },
    example: { method: 'boards.save', params: {} },
    execute: (_controller, _p, _capture, workspace) => workspace.save() },
]

export function hasLocalAgentMethod(method) {
  return descriptors.some(entry => entry.method === method)
}

/** Explicit closures are the only callable surface; never look up arbitrary controller methods. */
export function localAgentMethodMutatesBoard(method) {
  return descriptors.find(entry => entry.method === method)?.mutatesBoard ?? false
}

export function executeLocalAgentCommand(controller, command, capture, workspace) {
  const entry = descriptors.find(candidate => candidate.method === command?.method)
  if (!entry) throw new Error(`Unsupported local agent method: ${command?.method}`)
  return entry.execute(controller, command.params || {}, capture, workspace)
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
      arrow: { type: 'arrow', x1: 200, y1: 240, x2: 500, y2: 240, headLength: 28, headWidth: 24, fill: null },
      line: { type: 'line', x1: 200, y1: 200, x2: 300, y2: 250 },
      path: { type: 'path', path: [['M', 200, 200], ['L', 300, 250]], fill: null },
      text: { type: 'text', text: 'Synthetic title' },
      formula: { type: 'formula', latex: 'x=2' },
      group: { type: 'group', objects: [{ type: 'rect', width: 40, height: 40 }] },
    },
    workflow: [
      'Connect one browser tab and check health; require observe.stable before mutation.',
      'Approve mutations explicitly; discovery grants no permissions.',
      'Use commandEndpoint and re-observe after changes or board switches.',
      'Decode read-only screenshot PNGs for visual inspection.',
      'On disconnect or timeout, re-observe before retrying a possibly committed command.',
    ],
    safety: { localDevelopmentOnly: true, loopbackHost: '127.0.0.1', requireStableBeforeMutation: true,
      discoveryGrantsAuthorization: false, containsBoardData: false },
    limitations: [
      'Only commands in methods are executable in this build; planned operations are absent.',
      'Only top-level IDs are mutable; nested edits reject. deleteMany and empty-board clear are no-ops on empty input; bulk removal is atomic.',
      'group requires two top-level IDs; Board Groups and nested IDs reject. Ungroup and history remain UI actions.',
      'measure is read-only; layout is atomic, scene-based, with a CSS-pixel margin.',
      'Scene coordinates ignore pan/zoom; create/createMany default omitted origins to left/top recursively. Stamps and UI creation are unchanged.',
      'Create IDs are regenerated, including group children. Group children use existing Fabric-local geometry; formulas remain atomic/editable.',
      'Update schemas vary by kind: bounded style for shapes/text, opacity for groups, paint/ink for formulas. Geometry patches reject.',
      'Path items are intentionally permissive schema data; materialization may reject malformed path commands.',
      'Examples are synthetic; replace example IDs. Discovery does not authorize changes.',
      'Undo/Redo are UI actions, not bridge methods. Normal dev/production builds do not expose this bridge.',
      'Screenshot exports bounded canvas pixels only, not DOM overlays.',
    ],
  })
}
