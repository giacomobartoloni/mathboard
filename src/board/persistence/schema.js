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

import { BOARD_OBJECT_TYPES, STYLE_KEYS, TRANSFORM_KEYS } from '../objects/constants.js'

export const BOARD_DOCUMENT_FORMAT = 'mathboard-board'
export const BOARD_DOCUMENT_VERSION = 1

export const BOARD_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024
export const BOARD_DOCUMENT_MAX_OBJECTS = 10000
export const BOARD_DOCUMENT_MAX_DEPTH = 32
export const BOARD_TEXT_MAX_LENGTH = 100000
export const BOARD_LATEX_MAX_LENGTH = 50000

export const BOARD_DOCUMENT_ERROR_CODES = Object.freeze({
  INVALID: 'board_document_invalid',
  UNSUPPORTED_VERSION: 'board_document_unsupported_version',
  UNKNOWN_TYPE: 'board_document_unknown_type',
  DUPLICATE_ID: 'board_document_duplicate_id',
  TOO_LARGE: 'board_document_too_large',
  MATERIALIZE_FAILED: 'board_document_materialize_failed',
  FORMULA_RENDER_FAILED: 'board_document_formula_render_failed',
})

const ERROR_MESSAGES = Object.freeze({
  [BOARD_DOCUMENT_ERROR_CODES.INVALID]: 'Board document is invalid.',
  [BOARD_DOCUMENT_ERROR_CODES.UNSUPPORTED_VERSION]: 'This board document version is not supported.',
  [BOARD_DOCUMENT_ERROR_CODES.UNKNOWN_TYPE]: 'Board document contains an unsupported object type.',
  [BOARD_DOCUMENT_ERROR_CODES.DUPLICATE_ID]: 'Board document contains duplicate object IDs.',
  [BOARD_DOCUMENT_ERROR_CODES.TOO_LARGE]: 'Board document exceeds size limits.',
  [BOARD_DOCUMENT_ERROR_CODES.MATERIALIZE_FAILED]: 'Could not recreate board objects.',
  [BOARD_DOCUMENT_ERROR_CODES.FORMULA_RENDER_FAILED]: 'A formula in the board document could not be rendered.',
})

export class BoardDocumentError extends Error {
  constructor(code, detail) {
    const base = ERROR_MESSAGES[code] || 'Board document error.'
    super(detail ? `${base} ${detail}` : base)
    this.name = 'BoardDocumentError'
    this.code = code
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertFiniteNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      `Expected a finite number at ${path}.`,
    )
  }
}

function assertOptionalFiniteNumber(node, key, path) {
  if (node[key] === undefined || node[key] === null) return
  assertFiniteNumber(node[key], `${path}.${key}`)
}

function assertOptionalString(node, key, path) {
  if (node[key] === undefined || node[key] === null) return
  if (typeof node[key] !== 'string') {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      `Expected a string at ${path}.${key}.`,
    )
  }
}

function assertOptionalBoolean(node, key, path) {
  if (node[key] === undefined || node[key] === null) return
  if (typeof node[key] !== 'boolean') {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      `Expected a boolean at ${path}.${key}.`,
    )
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
      if (node[key] === undefined) return
      if (node[key] !== null && typeof node[key] !== 'string') {
        throw new BoardDocumentError(
          BOARD_DOCUMENT_ERROR_CODES.INVALID,
          `Expected a string or null at ${path}.${key}.`,
        )
      }
      return
    }
    if (key === 'strokeDashArray') {
      if (node[key] === undefined || node[key] === null) return
      if (!Array.isArray(node[key]) || node[key].some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
        throw new BoardDocumentError(
          BOARD_DOCUMENT_ERROR_CODES.INVALID,
          `Invalid strokeDashArray at ${path}.`,
        )
      }
      return
    }
    assertOptionalFiniteNumber(node, key, path)
  })
  assertOptionalString(node, 'mathboardInkMode', path)
}

function validateNode(node, path, depth, seenIds, counters) {
  if (depth > BOARD_DOCUMENT_MAX_DEPTH) {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      'Board document nesting is too deep.',
    )
  }
  if (!isPlainObject(node)) {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      `Expected an object at ${path}.`,
    )
  }
  if (typeof node.id !== 'string' || !node.id.length) {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      `Expected non-empty id at ${path}.id.`,
    )
  }
  if (seenIds.has(node.id)) {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.DUPLICATE_ID,
      `Duplicate id "${node.id}" at ${path}.`,
    )
  }
  seenIds.add(node.id)
  counters.objects += 1
  if (counters.objects > BOARD_DOCUMENT_MAX_OBJECTS) {
    throw new BoardDocumentError(BOARD_DOCUMENT_ERROR_CODES.TOO_LARGE)
  }

  if (typeof node.type !== 'string' || !BOARD_OBJECT_TYPES.includes(node.type)) {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.UNKNOWN_TYPE,
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
        throw new BoardDocumentError(
          BOARD_DOCUMENT_ERROR_CODES.INVALID,
          `Expected path array at ${path}.path.`,
        )
      }
      break
    case 'text':
      if (typeof node.text !== 'string') {
        throw new BoardDocumentError(
          BOARD_DOCUMENT_ERROR_CODES.INVALID,
          `Expected text string at ${path}.text.`,
        )
      }
      if (node.text.length > BOARD_TEXT_MAX_LENGTH) {
        throw new BoardDocumentError(BOARD_DOCUMENT_ERROR_CODES.TOO_LARGE)
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
        throw new BoardDocumentError(
          BOARD_DOCUMENT_ERROR_CODES.INVALID,
          `Expected non-empty latex at ${path}.latex.`,
        )
      }
      if (node.latex.length > BOARD_LATEX_MAX_LENGTH) {
        throw new BoardDocumentError(BOARD_DOCUMENT_ERROR_CODES.TOO_LARGE)
      }
      break
    case 'group':
      if (!Array.isArray(node.objects)) {
        throw new BoardDocumentError(
          BOARD_DOCUMENT_ERROR_CODES.INVALID,
          `Expected objects array at ${path}.objects.`,
        )
      }
      node.objects.forEach((child, index) => {
        validateNode(child, `${path}.objects[${index}]`, depth + 1, seenIds, counters)
      })
      break
    default:
      throw new BoardDocumentError(
        BOARD_DOCUMENT_ERROR_CODES.UNKNOWN_TYPE,
        `Unsupported type at ${path}.`,
      )
  }
}

export function utf8ByteLength(text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length
  }
  return unescape(encodeURIComponent(text)).length
}

/**
 * Validate a BoardDocument. Throws BoardDocumentError on failure.
 * @returns {object} the same document when valid
 */
export function validateBoardDocument(doc) {
  if (!isPlainObject(doc)) {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      'Root must be an object.',
    )
  }
  if (doc.format !== BOARD_DOCUMENT_FORMAT) {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      `Expected format "${BOARD_DOCUMENT_FORMAT}".`,
    )
  }
  if (doc.version !== BOARD_DOCUMENT_VERSION) {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.UNSUPPORTED_VERSION,
      `Got version ${JSON.stringify(doc.version)}.`,
    )
  }
  if (typeof doc.title !== 'string') {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      'Root.title must be a string.',
    )
  }
  if (!Array.isArray(doc.objects)) {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      'Root.objects must be an array.',
    )
  }

  const json = JSON.stringify(doc)
  if (utf8ByteLength(json) > BOARD_DOCUMENT_MAX_BYTES) {
    throw new BoardDocumentError(BOARD_DOCUMENT_ERROR_CODES.TOO_LARGE)
  }

  const seenIds = new Set()
  const counters = { objects: 0 }
  doc.objects.forEach((node, index) => {
    validateNode(node, `objects[${index}]`, 0, seenIds, counters)
  })
  return doc
}

export function createEmptyBoardDocument(title = 'Untitled board') {
  return {
    format: BOARD_DOCUMENT_FORMAT,
    version: BOARD_DOCUMENT_VERSION,
    title,
    objects: [],
  }
}
