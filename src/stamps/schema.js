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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/** Stamp transfer schema version. Bump when the payload shape changes. */
export const STAMP_VERSION = 1

/** Max UTF-8 byte length of the decoded JSON document. */
export const STAMP_MAX_BYTES = 256 * 1024

export const STAMP_NODE_TYPES = Object.freeze([
  'rect',
  'circle',
  'line',
  'path',
  'text',
  'formula',
  'group',
])

export const STAMP_ERROR_CODES = Object.freeze({
  EMPTY: 'stamp_empty',
  INVALID_ENCODING: 'stamp_invalid_encoding',
  TOO_LARGE: 'stamp_too_large',
  INVALID_JSON: 'stamp_invalid_json',
  UNSUPPORTED_VERSION: 'stamp_unsupported_version',
  INVALID_SHAPE: 'stamp_invalid_shape',
  UNKNOWN_TYPE: 'stamp_unknown_type',
  MATERIALIZE_FAILED: 'stamp_materialize_failed',
  FORMULA_RENDER_FAILED: 'stamp_formula_render_failed',
})

const ERROR_MESSAGES = Object.freeze({
  [STAMP_ERROR_CODES.EMPTY]: 'Stamp payload is empty.',
  [STAMP_ERROR_CODES.INVALID_ENCODING]: 'Stamp link is corrupted or not valid base64url.',
  [STAMP_ERROR_CODES.TOO_LARGE]: `Stamp payload exceeds the ${STAMP_MAX_BYTES} byte limit.`,
  [STAMP_ERROR_CODES.INVALID_JSON]: 'Stamp payload is not valid JSON.',
  [STAMP_ERROR_CODES.UNSUPPORTED_VERSION]: 'This stamp version is not supported.',
  [STAMP_ERROR_CODES.INVALID_SHAPE]: 'Stamp payload has an invalid structure.',
  [STAMP_ERROR_CODES.UNKNOWN_TYPE]: 'Stamp contains an unsupported object type.',
  [STAMP_ERROR_CODES.MATERIALIZE_FAILED]: 'Could not recreate stamp objects.',
  [STAMP_ERROR_CODES.FORMULA_RENDER_FAILED]: 'A formula in the stamp could not be rendered.',
})

export class StampError extends Error {
  constructor(code, detail) {
    const base = ERROR_MESSAGES[code] || 'Stamp error.'
    super(detail ? `${base} ${detail}` : base)
    this.name = 'StampError'
    this.code = code
  }
}

export function stampErrorMessage(code, detail) {
  return new StampError(code, detail).message
}

const TRANSFORM_KEYS = [
  'left',
  'top',
  'scaleX',
  'scaleY',
  'skewX',
  'skewY',
  'angle',
  'flipX',
  'flipY',
  'originX',
  'originY',
]

const STYLE_KEYS = [
  'stroke',
  'fill',
  'strokeWidth',
  'opacity',
  'strokeDashArray',
  'strokeLineCap',
  'strokeLineJoin',
]

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertFiniteNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, `Expected a finite number at ${path}.`)
  }
}

function assertOptionalFiniteNumber(node, key, path) {
  if (node[key] === undefined || node[key] === null) return
  assertFiniteNumber(node[key], `${path}.${key}`)
}

function assertOptionalString(node, key, path) {
  if (node[key] === undefined || node[key] === null) return
  if (typeof node[key] !== 'string') {
    throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, `Expected a string at ${path}.${key}.`)
  }
}

function assertOptionalBoolean(node, key, path) {
  if (node[key] === undefined || node[key] === null) return
  if (typeof node[key] !== 'boolean') {
    throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, `Expected a boolean at ${path}.${key}.`)
  }
}

function validateCommonProps(node, path) {
  TRANSFORM_KEYS.forEach((key) => {
    if (key === 'originX' || key === 'originY') {
      assertOptionalString(node, key, path)
      return
    }
    if (key === 'flipX' || key === 'flipY') {
      assertOptionalBoolean(node, key, path)
      return
    }
    assertOptionalFiniteNumber(node, key, path)
  })
  STYLE_KEYS.forEach((key) => {
    if (key === 'stroke' || key === 'fill' || key === 'strokeLineCap' || key === 'strokeLineJoin') {
      assertOptionalString(node, key, path)
      return
    }
    if (key === 'strokeDashArray') {
      if (node[key] === undefined || node[key] === null) return
      if (!Array.isArray(node[key]) || node[key].some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
        throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, `Invalid strokeDashArray at ${path}.`)
      }
      return
    }
    assertOptionalFiniteNumber(node, key, path)
  })
  assertOptionalString(node, 'mathboardInkMode', path)
  assertOptionalBoolean(node, 'mathboardRenderedInkIsLight', path)
}

function validateNode(node, path, depth) {
  if (depth > 32) {
    throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, 'Stamp nesting is too deep.')
  }
  if (!isPlainObject(node)) {
    throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, `Expected an object at ${path}.`)
  }
  if (typeof node.type !== 'string' || !STAMP_NODE_TYPES.includes(node.type)) {
    throw new StampError(
      STAMP_ERROR_CODES.UNKNOWN_TYPE,
      `Unsupported type "${node.type}" at ${path}.`,
    )
  }

  validateCommonProps(node, path)

  switch (node.type) {
    case 'rect':
      assertOptionalFiniteNumber(node, 'width', path)
      assertOptionalFiniteNumber(node, 'height', path)
      assertOptionalFiniteNumber(node, 'rx', path)
      assertOptionalFiniteNumber(node, 'ry', path)
      break
    case 'circle':
      assertOptionalFiniteNumber(node, 'radius', path)
      break
    case 'line':
      assertFiniteNumber(node.x1, `${path}.x1`)
      assertFiniteNumber(node.y1, `${path}.y1`)
      assertFiniteNumber(node.x2, `${path}.x2`)
      assertFiniteNumber(node.y2, `${path}.y2`)
      break
    case 'path':
      if (!Array.isArray(node.path)) {
        throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, `Expected path array at ${path}.path.`)
      }
      break
    case 'text':
      if (typeof node.text !== 'string') {
        throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, `Expected text string at ${path}.text.`)
      }
      assertOptionalFiniteNumber(node, 'fontSize', path)
      assertOptionalString(node, 'fontFamily', path)
      assertOptionalString(node, 'fontWeight', path)
      assertOptionalString(node, 'fontStyle', path)
      assertOptionalString(node, 'textAlign', path)
      assertOptionalFiniteNumber(node, 'lineHeight', path)
      assertOptionalFiniteNumber(node, 'charSpacing', path)
      assertOptionalBoolean(node, 'underline', path)
      assertOptionalBoolean(node, 'linethrough', path)
      assertOptionalBoolean(node, 'overline', path)
      break
    case 'formula':
      if (typeof node.latex !== 'string' || !node.latex.trim()) {
        throw new StampError(
          STAMP_ERROR_CODES.INVALID_SHAPE,
          `Expected non-empty latex at ${path}.latex.`,
        )
      }
      break
    case 'group':
      if (!Array.isArray(node.objects)) {
        throw new StampError(
          STAMP_ERROR_CODES.INVALID_SHAPE,
          `Expected objects array at ${path}.objects.`,
        )
      }
      node.objects.forEach((child, index) => {
        validateNode(child, `${path}.objects[${index}]`, depth + 1)
      })
      break
    default:
      throw new StampError(STAMP_ERROR_CODES.UNKNOWN_TYPE, `Unsupported type at ${path}.`)
  }
}

/**
 * Validate a decoded stamp document. Throws StampError on failure.
 * @returns {object} the same document when valid
 */
export function validateStampDocument(doc) {
  if (!isPlainObject(doc)) {
    throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, 'Root must be an object.')
  }
  if (doc.version !== STAMP_VERSION) {
    throw new StampError(
      STAMP_ERROR_CODES.UNSUPPORTED_VERSION,
      `Got version ${JSON.stringify(doc.version)}.`,
    )
  }
  if (!Array.isArray(doc.objects)) {
    throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, 'Root.objects must be an array.')
  }
  if (doc.objects.length < 1) {
    throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, 'Stamp must contain at least one object.')
  }
  doc.objects.forEach((node, index) => {
    validateNode(node, `objects[${index}]`, 0)
  })
  return doc
}

export function utf8ByteLength(text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length
  }
  // Fallback for unusual environments.
  return unescape(encodeURIComponent(text)).length
}
