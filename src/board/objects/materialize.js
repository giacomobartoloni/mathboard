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

import { Rect, Circle, Ellipse, Polygon, Line, Path, IText, Textbox, Group } from 'fabric'
import { ArrowObject } from './ArrowObject.js'
import { ensureMathBoardObjectId } from '../ids.js'
import { STYLE_KEYS, TEXT_KEYS, TRANSFORM_KEYS } from './constants.js'

function pickDefined(source, keys) {
  const out = {}
  keys.forEach((key) => {
    if (source[key] !== undefined && source[key] !== null) {
      out[key] = source[key]
    }
  })
  return out
}

/** Keep `null` fill/stroke — Fabric Path defaults fill to solid black otherwise. */
function pickStyle(source) {
  const out = {}
  STYLE_KEYS.forEach((key) => {
    if (source[key] !== undefined) {
      out[key] = source[key]
    }
  })
  return out
}

function applyInkMetadata(object, node) {
  if (node.mathboardInkMode !== undefined) {
    object.mathboardInkMode = node.mathboardInkMode
  }
  if (node.mathboardRenderedInkIsLight !== undefined) {
    object.mathboardRenderedInkIsLight = node.mathboardRenderedInkIsLight
  }
}

/**
 * Formula rematerialization: keep AUTO/FIXED ink mode, but never restore
 * `mathboardRenderedInkIsLight`. That polarity describes the bitmap just
 * produced by the current renderer; a stale Stamp value would make syncInk()
 * invert an already-correct image on cross-theme import.
 */
function applyFormulaInkMetadata(object, node) {
  if (node.mathboardInkMode !== undefined) {
    object.mathboardInkMode = node.mathboardInkMode
  }
}

function applyIdentity(object, node, { restoreIds = false } = {}) {
  if (restoreIds && typeof node.id === 'string' && node.id.length > 0) {
    ensureMathBoardObjectId(object, node.id)
  } else if (restoreIds) {
    ensureMathBoardObjectId(object)
  }
}

export function disposeMaterializedObject(object, seen = new Set()) {
  if (!object || seen.has(object)) return
  seen.add(object)
  object.getObjects?.().forEach(child => disposeMaterializedObject(child, seen))
  try { object.dispose?.() } catch { /* Preserve the original materialization failure. */ }
}

/**
 * Materialize one semantic node into a Fabric object (off-canvas).
 *
 * @param {object} node
 * @param {{ buildFormula: Function, restoreIds?: boolean }} options
 * @returns {Promise<object>}
 */
export async function materializeBoardObject(node, options = {}) {
  options.beforeNode?.()
  const buildFormula = options.buildFormula
  if (typeof buildFormula !== 'function') {
    throw new Error('Formula builder is required.')
  }

  const transform = pickDefined(node, TRANSFORM_KEYS)
  const style = pickStyle(node)
  // Pencil strokes omit fill historically; Fabric Path would otherwise paint solid black.
  if (node.type === 'path' && style.fill === undefined) {
    style.fill = null
  }

  let object
  switch (node.type) {
    case 'rect': {
      object = new Rect({
        ...style,
        ...transform,
        width: node.width ?? 0,
        height: node.height ?? 0,
        ...pickDefined(node, ['rx', 'ry']),
      })
      applyInkMetadata(object, node)
      break
    }
    case 'circle': {
      object = new Circle({
        ...style,
        ...transform,
        radius: node.radius ?? 0,
      })
      applyInkMetadata(object, node)
      break
    }
    case 'ellipse': {
      object = new Ellipse({ ...style, ...transform, rx: node.rx, ry: node.ry })
      applyInkMetadata(object, node)
      break
    }
    case 'polygon': {
      object = new Polygon(node.points.map(({ x, y }) => ({ x, y })), { ...style, ...transform })
      applyInkMetadata(object, node)
      break
    }
    case 'arrow': {
      object = new ArrowObject([], { ...style, ...transform, ...pickDefined(node, ['x1', 'y1', 'x2', 'y2', 'headLength', 'headWidth']) })
      applyInkMetadata(object, node)
      break
    }
    case 'line': {
      object = new Line([node.x1, node.y1, node.x2, node.y2], {
        ...style,
        ...transform,
      })
      applyInkMetadata(object, node)
      break
    }
    case 'path': {
      object = new Path(node.path, {
        ...style,
        ...transform,
      })
      // Finite input coordinates may still overflow Fabric's bounds calculation.
      if (['left', 'top', 'width', 'height'].some(key => !Number.isFinite(object[key]))) {
        disposeMaterializedObject(object)
        throw new Error('Path bounds must be finite.')
      }
      applyInkMetadata(object, node)
      break
    }
    case 'text': {
      const textProps = pickDefined(node, TEXT_KEYS)
      const props = { ...style, ...transform, fontFamily: 'Arial', ...textProps }
      object = node.width === undefined ? new IText(node.text, props)
        : new Textbox(node.text, { ...props, width: node.width })
      applyInkMetadata(object, node)
      break
    }
    case 'formula': {
      object = await buildFormula({
        latex: node.latex,
        ...transform,
        ...style,
        mathboardInkMode: node.mathboardInkMode,
      })
      if (!object) {
        throw new Error('Formula render failed.')
      }
      applyFormulaInkMetadata(object, node)
      break
    }
    case 'group': {
      const children = []
      try {
        for (const child of node.objects || []) {
          children.push(await materializeBoardObject(child, options))
        }
        object = new Group(children, {
          ...transform,
          ...style,
          subTargetCheck: false,
          interactive: false,
        })
      } catch (error) {
        children.forEach(child => disposeMaterializedObject(child))
        throw error
      }
      applyInkMetadata(object, node)
      break
    }
    default:
      throw new Error(`Cannot materialize type "${node.type}".`)
  }

  applyIdentity(object, node, options)
  return object
}

/**
 * @param {object[]} specs
 * @param {{ buildFormula: Function, restoreIds?: boolean }} options
 * @returns {Promise<object[]>}
 */
export async function materializeBoardObjects(specs, options = {}) {
  const objects = []
  try {
    for (const node of specs) {
      objects.push(await materializeBoardObject(node, options))
    }
  } catch (error) {
    objects.forEach(object => disposeMaterializedObject(object))
    throw error
  }
  return objects
}
