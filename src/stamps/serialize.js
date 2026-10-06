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

import { BoardObjectPolicy } from '../board/BoardObjectPolicy.js'
import { STAMP_VERSION, STAMP_ERROR_CODES, StampError } from './schema.js'
import { encodeStampDocument } from './encode.js'

const boardObjectPolicy = new BoardObjectPolicy()

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

function pickDefined(source, keys) {
  const out = {}
  keys.forEach((key) => {
    if (source[key] !== undefined && source[key] !== null) {
      out[key] = Array.isArray(source[key]) ? source[key].slice() : source[key]
    }
  })
  return out
}

/**
 * Style props where `null` is meaningful (no paint). Dropping null lets Fabric
 * Path/Object defaults reintroduce a solid black fill on materialize.
 */
function pickStyle(source) {
  const out = {}
  STYLE_KEYS.forEach((key) => {
    const value = source[key]
    if (value === undefined) return
    out[key] = Array.isArray(value) ? value.slice() : value
  })
  return out
}

function isType(object, ...types) {
  if (!object) return false
  if (typeof object.isType === 'function') return object.isType(...types)
  const actual = String(object.type || '').toLowerCase()
  return types.some((type) => type.toLowerCase() === actual)
}

function commonProps(object) {
  const props = {
    ...pickDefined(object, TRANSFORM_KEYS),
    ...pickStyle(object),
  }
  if (object.mathboardInkMode !== undefined) {
    props.mathboardInkMode = object.mathboardInkMode
  }
  if (object.mathboardRenderedInkIsLight !== undefined) {
    props.mathboardRenderedInkIsLight = object.mathboardRenderedInkIsLight
  }
  return props
}

/**
 * Serialize one Fabric object (or permanent Group) to a stamp node.
 * ActiveSelection is not a stamp node — callers should pass members.
 */
export function serializeFabricObject(object) {
  if (!object) {
    throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, 'Missing object.')
  }

  if (isType(object, 'ActiveSelection', 'activeselection')) {
    throw new StampError(
      STAMP_ERROR_CODES.INVALID_SHAPE,
      'ActiveSelection cannot be serialized; export its members.',
    )
  }

  // Semantic Formula must win over Fabric Group.
  // Vector formulas may be implemented as Groups but must serialize as formula nodes.
  if (boardObjectPolicy.isFormula(object)) {
    if (typeof object.latex !== 'string' || !object.latex.trim()) {
      throw new StampError(
        STAMP_ERROR_CODES.INVALID_SHAPE,
        'Formula is missing latex.',
      )
    }
    return {
      type: 'formula',
      latex: object.latex,
      ...commonProps(object),
    }
  }

  if (isType(object, 'Group', 'group')) {
    const children = typeof object.getObjects === 'function' ? object.getObjects() : []
    return {
      type: 'group',
      objects: children.map((child) => serializeFabricObject(child)),
      ...commonProps(object),
    }
  }

  if (isType(object, 'Rect', 'rect')) {
    return {
      type: 'rect',
      width: object.width,
      height: object.height,
      rx: object.rx,
      ry: object.ry,
      ...commonProps(object),
    }
  }

  if (isType(object, 'Circle', 'circle')) {
    return {
      type: 'circle',
      radius: object.radius,
      ...commonProps(object),
    }
  }

  if (isType(object, 'Line', 'line')) {
    return {
      type: 'line',
      x1: object.x1,
      y1: object.y1,
      x2: object.x2,
      y2: object.y2,
      ...commonProps(object),
    }
  }

  if (isType(object, 'Path', 'path')) {
    return {
      type: 'path',
      path: object.path,
      ...commonProps(object),
    }
  }

  if (isType(object, 'IText', 'Text', 'Textbox', 'i-text', 'text', 'textbox')) {
    return {
      type: 'text',
      text: object.text ?? '',
      fontSize: object.fontSize,
      fontFamily: object.fontFamily,
      fontWeight: object.fontWeight,
      fontStyle: object.fontStyle,
      textAlign: object.textAlign,
      lineHeight: object.lineHeight,
      charSpacing: object.charSpacing,
      underline: object.underline,
      linethrough: object.linethrough,
      overline: object.overline,
      ...commonProps(object),
    }
  }

  throw new StampError(
    STAMP_ERROR_CODES.UNKNOWN_TYPE,
    `Cannot export object type "${object.type}".`,
  )
}

export function stampDocumentFromObjects(objects) {
  if (!Array.isArray(objects) || objects.length < 1) {
    throw new StampError(
      STAMP_ERROR_CODES.INVALID_SHAPE,
      'At least one object is required.',
    )
  }
  return {
    version: STAMP_VERSION,
    objects: objects.map((object) => serializeFabricObject(object)),
  }
}

export function encodeObjectsAsStamp(objects) {
  return encodeStampDocument(stampDocumentFromObjects(objects))
}
