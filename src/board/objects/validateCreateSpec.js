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

import { BOARD_OBJECT_TYPES, TRANSFORM_KEYS, TEXT_KEYS, STYLE_KEYS } from './constants.js'
import { BoardControllerError, BOARD_CONTROLLER_ERROR_CODES as C } from '../BoardControllerError.js'

const TYPE_KEYS = { rect: ['width', 'height', 'rx', 'ry'], circle: ['radius'],
  line: ['x1', 'y1', 'x2', 'y2'], path: ['path'], text: ['text', ...TEXT_KEYS],
  formula: ['latex'], group: ['objects'] }

const NUMERIC_TRANSFORMS = TRANSFORM_KEYS.filter((key) => !['flipX', 'flipY', 'originX', 'originY'].includes(key))
const NUMERIC_TEXT = ['fontSize', 'lineHeight', 'charSpacing']
const BOOLEAN_TEXT = ['underline', 'linethrough', 'overline']
const STRING_TEXT = ['text', 'fontFamily', 'fontStyle', 'textAlign']

function isPlainObject(value) {
  return Boolean(value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function invalid(code) {
  throw new BoardControllerError(code, code === C.INVALID_PATCH ? 'Invalid object patch.' : 'Invalid object spec.')
}

function validateValues(value, code) {
  for (const key of [...NUMERIC_TRANSFORMS, ...NUMERIC_TEXT, 'width', 'height', 'radius', 'rx', 'ry', 'strokeWidth', 'opacity', 'x1', 'y1', 'x2', 'y2']) {
    if (key in value && !Number.isFinite(value[key])) invalid(code)
  }
  for (const key of ['flipX', 'flipY', ...BOOLEAN_TEXT]) {
    if (key in value && typeof value[key] !== 'boolean') invalid(code)
  }
  for (const [key, names] of [['originX', ['left', 'center', 'right']], ['originY', ['top', 'center', 'bottom']]]) {
    if (key in value && !names.includes(value[key]) && !Number.isFinite(value[key])) invalid(code)
  }
  for (const key of STRING_TEXT) {
    if (key in value && typeof value[key] !== 'string') invalid(code)
  }
  if ('fontWeight' in value && typeof value.fontWeight !== 'string' && !Number.isFinite(value.fontWeight)) invalid(code)
  if ('latex' in value && (typeof value.latex !== 'string' || !value.latex.trim())) invalid(code)
}

export function validateCreateSpec(spec, ancestors = new Set()) {
  if (!isPlainObject(spec) || !BOARD_OBJECT_TYPES.includes(spec.type) || ancestors.has(spec)) invalid(C.INVALID_SPEC)
  const allowed = ['type', 'id', ...TRANSFORM_KEYS, ...STYLE_KEYS, 'mathboardInkMode', ...TYPE_KEYS[spec.type]]
  if (Object.keys(spec).some((key) => !allowed.includes(key))) invalid(C.INVALID_SPEC)
  for (const key of ['stroke', 'fill', 'strokeLineCap', 'strokeLineJoin']) {
    if (key in spec && spec[key] !== null && typeof spec[key] !== 'string') invalid(C.INVALID_SPEC)
  }
  if ('strokeDashArray' in spec && spec.strokeDashArray !== null
    && (!Array.isArray(spec.strokeDashArray) || !Array.from(spec.strokeDashArray).every(Number.isFinite))) invalid(C.INVALID_SPEC)
  if ('mathboardInkMode' in spec && !['auto', 'fixed'].includes(spec.mathboardInkMode)) invalid(C.INVALID_SPEC)
  validateValues(spec, C.INVALID_SPEC)
  if (spec.type === 'text' && typeof spec.text !== 'string') invalid(C.INVALID_SPEC)
  if (spec.type === 'formula' && (typeof spec.latex !== 'string' || !spec.latex.trim())) invalid(C.INVALID_SPEC)
  if (spec.type === 'line' && !['x1', 'y1', 'x2', 'y2'].every((key) => Number.isFinite(spec[key]))) invalid(C.INVALID_SPEC)
  if (spec.type === 'path' && !Array.isArray(spec.path)) invalid(C.INVALID_SPEC)
  if (spec.type === 'group') {
    if (!Array.isArray(spec.objects)) invalid(C.INVALID_SPEC)
    ancestors.add(spec)
    for (const child of spec.objects) validateCreateSpec(child, ancestors)
    ancestors.delete(spec)
  }
}

export function validateObjectPatch(patch, kind) {
  if (!isPlainObject(patch)) invalid(C.INVALID_PATCH)
  const allowed = [...TRANSFORM_KEYS,
    ...(kind === 'text' ? ['text', ...TEXT_KEYS] : []),
    ...(kind === 'formula' ? ['latex', 'fill', 'stroke', 'opacity', 'mathboardInkMode'] : []),
    ...(kind === 'group' ? ['opacity'] : []),
    ...(['shape', 'path', 'text'].includes(kind) ? [...STYLE_KEYS, 'mathboardInkMode'] : []),
  ]
  if (Object.keys(patch).some((key) => !allowed.includes(key))) invalid(C.INVALID_PATCH)
  validateValues(patch, C.INVALID_PATCH)
  for (const key of ['stroke', 'fill']) {
    if (!(key in patch)) continue
    const paint = patch[key]
    if (paint !== null && typeof paint !== 'string') invalid(C.INVALID_PATCH)
    if (kind === 'formula' && (typeof paint !== 'string' || !paint.trim()
      || ['none', 'transparent'].includes(paint.trim().toLowerCase()))) invalid(C.INVALID_PATCH)
  }
  if ('opacity' in patch && (patch.opacity < 0 || patch.opacity > 1)) invalid(C.INVALID_PATCH)
  if ('strokeWidth' in patch && patch.strokeWidth < 0) invalid(C.INVALID_PATCH)
  if ('strokeDashArray' in patch && patch.strokeDashArray !== null
    && (!Array.isArray(patch.strokeDashArray)
      || !Array.from(patch.strokeDashArray).every((value) => Number.isFinite(value) && value >= 0))) invalid(C.INVALID_PATCH)
  if ('strokeLineCap' in patch && !['butt', 'round', 'square'].includes(patch.strokeLineCap)) invalid(C.INVALID_PATCH)
  if ('strokeLineJoin' in patch && !['bevel', 'round', 'miter'].includes(patch.strokeLineJoin)) invalid(C.INVALID_PATCH)
  if ('mathboardInkMode' in patch && !['auto', 'fixed'].includes(patch.mathboardInkMode)) invalid(C.INVALID_PATCH)
}
