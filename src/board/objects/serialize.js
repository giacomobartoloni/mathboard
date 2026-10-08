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

import { util } from 'fabric'
import { BoardObjectPolicy } from '../BoardObjectPolicy.js'
import { ensureMathBoardObjectId, getMathBoardObjectId } from '../ids.js'
import { STYLE_KEYS, TEXT_KEYS, TRANSFORM_KEYS } from './constants.js'

const defaultPolicy = new BoardObjectPolicy()

const PLANE_RESTORE_KEYS = [
  'left',
  'top',
  'scaleX',
  'scaleY',
  'skewX',
  'skewY',
  'angle',
  'flipX',
  'flipY',
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

/** Style props where `null` is meaningful (no paint). */
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

function isActiveSelection(object) {
  return isType(object, 'ActiveSelection', 'activeselection')
}

/**
 * Canvas-plane transform/style snapshot. Mirrors history/commandLog.snapshotObject
 * for ActiveSelection members without permanently mutating runtime.
 */
function canvasPlaneProps(object) {
  const group = object.group
  if (!isActiveSelection(group)) {
    return {
      ...pickDefined(object, TRANSFORM_KEYS),
      ...pickStyle(object),
    }
  }

  const saved = {}
  PLANE_RESTORE_KEYS.forEach((key) => {
    saved[key] = object[key]
  })
  try {
    util.sendObjectToPlane(object, group.calcTransformMatrix())
    return {
      ...pickDefined(object, TRANSFORM_KEYS),
      ...pickStyle(object),
    }
  } finally {
    object.set(saved)
    object.setCoords()
  }
}

function commonProps(object) {
  const props = canvasPlaneProps(object)
  if (object.mathboardInkMode !== undefined) {
    props.mathboardInkMode = object.mathboardInkMode
  }
  if (object.mathboardRenderedInkIsLight !== undefined) {
    props.mathboardRenderedInkIsLight = object.mathboardRenderedInkIsLight
  }
  return props
}

/**
 * Read one Fabric object as an internal semantic board object.
 * ActiveSelection is rejected — callers must pass members.
 *
 * @param {object} object
 * @param {{ boardObjectPolicy?: BoardObjectPolicy, includeId?: boolean, ensureId?: boolean }} [options]
 * @returns {object}
 */
export function readSemanticBoardObject(object, options = {}) {
  if (!object) {
    throw new Error('Missing object.')
  }

  if (isActiveSelection(object)) {
    throw new Error('ActiveSelection cannot be serialized; export its members.')
  }

  const policy = options.boardObjectPolicy || defaultPolicy
  const includeId = options.includeId !== false
  const ensureId = options.ensureId !== false

  let id = null
  if (includeId) {
    id = ensureId ? ensureMathBoardObjectId(object) : getMathBoardObjectId(object)
  }

  const withId = (node) => (includeId && id ? { id, ...node } : node)

  if (policy.isFormula(object)) {
    if (typeof object.latex !== 'string' || !object.latex.trim()) {
      throw new Error('Formula is missing latex.')
    }
    return withId({
      type: 'formula',
      latex: object.latex,
      ...commonProps(object),
    })
  }

  if (isType(object, 'Group', 'group')) {
    const children = typeof object.getObjects === 'function' ? object.getObjects() : []
    return withId({
      type: 'group',
      objects: children.map((child) => readSemanticBoardObject(child, options)),
      ...commonProps(object),
    })
  }

  if (isType(object, 'Rect', 'rect')) {
    return withId({
      type: 'rect',
      width: object.width,
      height: object.height,
      rx: object.rx,
      ry: object.ry,
      ...commonProps(object),
    })
  }

  if (isType(object, 'Circle', 'circle')) {
    return withId({
      type: 'circle',
      radius: object.radius,
      ...commonProps(object),
    })
  }

  if (isType(object, 'Line', 'line')) {
    return withId({
      type: 'line',
      x1: object.x1,
      y1: object.y1,
      x2: object.x2,
      y2: object.y2,
      ...commonProps(object),
    })
  }

  if (isType(object, 'Path', 'path')) {
    return withId({
      type: 'path',
      path: object.path,
      ...commonProps(object),
    })
  }

  if (isType(object, 'IText', 'Text', 'Textbox', 'i-text', 'text', 'textbox')) {
    const textProps = {}
    TEXT_KEYS.forEach((key) => {
      if (object[key] !== undefined && object[key] !== null) {
        textProps[key] = object[key]
      }
    })
    return withId({
      type: 'text',
      text: object.text ?? '',
      ...textProps,
      ...commonProps(object),
    })
  }

  throw new Error(`Cannot export object type "${object.type}".`)
}

/**
 * Stamp adapter: semantic node without identity.
 */
export function toStampNode(semantic) {
  if (!semantic || typeof semantic !== 'object') return semantic
  const { id, objects, ...rest } = semantic
  void id
  if (semantic.type === 'group' && Array.isArray(objects)) {
    return { ...rest, type: 'group', objects: objects.map(toStampNode) }
  }
  return { ...rest, type: semantic.type }
}

/** BoardDocument deliberately excludes renderer-only legacy polarity. */
export function toBoardDocumentNode(semantic) {
  if (!semantic || typeof semantic !== 'object') return semantic
  const { mathboardRenderedInkIsLight, objects, ...rest } = semantic
  void mathboardRenderedInkIsLight
  return objects ? { ...rest, objects: objects.map(toBoardDocumentNode) } : rest
}
