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

import { BOARD_OBJECT_TYPES, TRANSFORM_KEYS, TEXT_KEYS, STYLE_KEYS } from '../objects/constants.js'
import { getScreenshotDescriptor } from '../capture/discovery.js'

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
  path: { path: { type: 'array', description: 'Path-command data; runtime validates.', items: {} } },
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
  description: 'Optional boolean selection.' }
const node = { type: 'object', required: ['id', 'type'], properties: { id: nonempty, type: { enum: [...BOARD_OBJECT_TYPES] } },
  additionalProperties: true, description: 'Detached semantic node; formula retains LaTeX.' }
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
  { method: 'boards.list', summary: 'List local board metadata. IndexedDB writes are automatic and retained.', mutatesBoard: false,
    paramsSchema: params({}),
    resultSchema: { type: 'array', items: { type: 'object', required: ['id', 'title', 'isActive'] } },
    example: { method: 'boards.list', params: {} },
    execute: (_controller, _p, _capture, workspace) => workspace.list() },
  { method: 'boards.create', summary: 'Create and activate a local board, saved automatically; omitted title gets a math-inspired random name.', mutatesBoard: true,
    paramsSchema: params({ title: { type: 'string', minLength: 1, maxLength: 120 } }),
    resultSchema: { type: 'object', required: ['id', 'title', 'isActive'] },
    example: { method: 'boards.create', params: { title: 'Algebra' } },
    execute: (_controller, p, _capture, workspace) => workspace.create(p) },
  { method: 'boards.open', summary: 'Open an unarchived local board; resets in-memory history.', mutatesBoard: true,
    paramsSchema: params({ boardId: nonempty }, ['boardId']),
    resultSchema: { type: 'object', required: ['id', 'title', 'isActive'] },
    example: { method: 'boards.open', params: { boardId: 'mb_example' } },
    execute: (_controller, p, _capture, workspace) => workspace.open(p) },
  { method: 'boards.rename', summary: 'Rename a local board and its semantic document.', mutatesBoard: true,
    paramsSchema: params({ boardId: nonempty, title: { type: 'string', minLength: 1, maxLength: 120 } }, ['boardId', 'title']),
    resultSchema: { type: 'object', required: ['id', 'title'] },
    example: { method: 'boards.rename', params: { boardId: 'mb_example', title: 'Geometry' } },
    execute: (_controller, p, _capture, workspace) => workspace.rename(p) },
  { method: 'boards.listArchived', summary: 'List archived board metadata without documents.', mutatesBoard: false,
    paramsSchema: params({}),
    resultSchema: { type: 'array', items: { type: 'object', required: ['id', 'title', 'archivedAt'] } },
    example: { method: 'boards.listArchived', params: {} },
    execute: (_controller, _p, _capture, workspace) => workspace.listArchived() },
  { method: 'boards.archive', summary: 'Hide a board without deleting data; new active board if needed.', mutatesBoard: true,
    paramsSchema: params({ boardId: nonempty }, ['boardId']),
    resultSchema: { type: 'object', required: ['id', 'archivedAt'] },
    example: { method: 'boards.archive', params: { boardId: 'mb_example' } },
    execute: (_controller, p, _capture, workspace) => workspace.archive(p) },
  { method: 'boards.unarchive', summary: 'Return a preserved archived board to the library.', mutatesBoard: true,
    paramsSchema: params({ boardId: nonempty }, ['boardId']),
    resultSchema: { type: 'object', required: ['id', 'title'] },
    example: { method: 'boards.unarchive', params: { boardId: 'mb_example' } },
    execute: (_controller, p, _capture, workspace) => workspace.unarchive(p) },
  { method: 'boards.delete', summary: 'Permanently delete one board locally. Irreversible; explicit confirm:true required.', mutatesBoard: true,
    paramsSchema: params({ boardId: nonempty, confirm: { type: 'boolean', const: true } }, ['boardId', 'confirm']),
    resultSchema: { type: 'object', required: ['id', 'deleted'] },
    example: { method: 'boards.delete', params: { boardId: 'mb_example', confirm: true } },
    execute: (_controller, p, _capture, workspace) => workspace.delete(p) },
]

export function hasBoardCommandMethod(method) {
  return descriptors.some(entry => entry.method === method)
}

/** Explicit closures are the only callable surface; never look up arbitrary controller methods. */
export function boardCommandMutatesBoard(method) {
  return descriptors.find(entry => entry.method === method)?.mutatesBoard ?? false
}

export function executeBoardCommand(controller, command, capture, workspace) {
  const entry = descriptors.find(candidate => candidate.method === command?.method)
  if (!entry) throw new Error(`Unsupported board method: ${command?.method}`)
  return entry.execute(controller, command.params || {}, capture, workspace)
}

export function getBoardCommandDescriptors() {
  return structuredClone(descriptors.map(({ execute, ...metadata }) => {
    void execute
    return metadata
  }))
}

export function getBoardDiscoveryTypes() {
  return structuredClone({ objectTypes: [...BOARD_OBJECT_TYPES], patchSchemas })
}

