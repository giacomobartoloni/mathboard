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

import { Rect, Circle, Line, Path, IText, Group } from 'fabric'
import { STAMP_ERROR_CODES, StampError } from './schema.js'

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
 * Invert an already-correct image on cross-theme import.
 */
function applyFormulaInkMetadata(object, node) {
  if (node.mathboardInkMode !== undefined) {
    object.mathboardInkMode = node.mathboardInkMode
  }
}

/**
 * Build Fabric objects from a validated stamp document.
 * Formula nodes require `buildFormula({ latex, left, top, ... })` which must
 * return a Fabric formula object (or null / throw on failure).
 *
 * @param {object} doc validated stamp document
 * @param {{ buildFormula: Function }} options
 * @returns {Promise<import('fabric').FabricObject[]>}
 */
export async function materializeStampDocument(doc, options = {}) {
  const buildFormula = options.buildFormula
  if (typeof buildFormula !== 'function') {
    throw new StampError(
      STAMP_ERROR_CODES.MATERIALIZE_FAILED,
      'Formula builder is required.',
    )
  }

  try {
    const objects = []
    for (const node of doc.objects) {
      objects.push(await materializeNode(node, buildFormula))
    }
    return objects
  } catch (error) {
    if (error instanceof StampError) throw error
    throw new StampError(
      STAMP_ERROR_CODES.MATERIALIZE_FAILED,
      error?.message || String(error),
    )
  }
}

async function materializeNode(node, buildFormula) {
  const transform = pickDefined(node, TRANSFORM_KEYS)
  const style = pickStyle(node)
  // Pencil strokes omit fill historically; Fabric Path would otherwise paint solid black.
  if (node.type === 'path' && style.fill === undefined) {
    style.fill = null
  }

  switch (node.type) {
    case 'rect': {
      const object = new Rect({
        ...style,
        ...transform,
        width: node.width ?? 0,
        height: node.height ?? 0,
        ...pickDefined(node, ['rx', 'ry']),
      })
      applyInkMetadata(object, node)
      return object
    }
    case 'circle': {
      const object = new Circle({
        ...style,
        ...transform,
        radius: node.radius ?? 0,
      })
      applyInkMetadata(object, node)
      return object
    }
    case 'line': {
      const object = new Line([node.x1, node.y1, node.x2, node.y2], {
        ...style,
        ...transform,
      })
      applyInkMetadata(object, node)
      return object
    }
    case 'path': {
      const object = new Path(node.path, {
        ...style,
        ...transform,
      })
      applyInkMetadata(object, node)
      return object
    }
    case 'text': {
      // Only pass defined text props. Explicit `fontStyle: undefined` (etc.)
      // overwrites Fabric defaults and crashes getFontCache(...toLowerCase()).
      const textProps = pickDefined(node, [
        'fontSize',
        'fontFamily',
        'fontWeight',
        'fontStyle',
        'textAlign',
        'lineHeight',
        'charSpacing',
        'underline',
        'linethrough',
        'overline',
      ])
      const object = new IText(node.text, {
        ...style,
        ...transform,
        ...textProps,
      })
      applyInkMetadata(object, node)
      return object
    }
    case 'formula': {
      const img = await buildFormula({
        latex: node.latex,
        ...transform,
        ...style,
        mathboardInkMode: node.mathboardInkMode,
      })
      if (!img) {
        throw new StampError(STAMP_ERROR_CODES.FORMULA_RENDER_FAILED)
      }
      applyFormulaInkMetadata(img, node)
      return img
    }
    case 'group': {
      const children = []
      for (const child of node.objects) {
        children.push(await materializeNode(child, buildFormula))
      }
      const group = new Group(children, {
        ...transform,
        ...style,
        subTargetCheck: false,
        interactive: false,
      })
      applyInkMetadata(group, node)
      return group
    }
    default:
      throw new StampError(
        STAMP_ERROR_CODES.UNKNOWN_TYPE,
        `Cannot materialize type "${node.type}".`,
      )
  }
}
