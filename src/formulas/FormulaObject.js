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

import { Group, classRegistry } from 'fabric'
import { FORMULA_TYPE } from './constants.js'
import { INK_MODE_AUTO } from '../config/themes.js'

/** Selection/hit chrome only; does not change SVG geometry or Stamp. */
export const FORMULA_SELECTION_PADDING = 6

/**
 * Atomic board Formula: Fabric Group of MathJax SVG vector children.
 * Product semantics use `formulaType` (legacy discriminator), not Fabric type.
 */
export class FormulaObject extends Group {
  constructor(objects = [], options = {}) {
    const {
      latex,
      mathboardInkMode,
      formulaType,
      ...fabricOptions
    } = options

    super(objects, {
      ...fabricOptions,
      padding: fabricOptions.padding ?? FORMULA_SELECTION_PADDING,
      subTargetCheck: false,
      interactive: false,
    })

    this.latex = latex ?? ''
    this.formulaType = formulaType ?? FORMULA_TYPE
    this.mathboardInkMode = mathboardInkMode ?? INK_MODE_AUTO

    lockDescendants(this)
  }

  /**
   * @param {import('fabric').FabricObject[]} children
   * @param {object} svgOptions from loadSVGFromString
   * @param {{ latex: string, left: number, top: number, mathboardInkMode?: string }} meta
   */
  static fromParsedSvg(children, svgOptions = {}, meta = {}) {
    return new FormulaObject(children, {
      ...svgOptions,
      left: meta.left,
      top: meta.top,
      originX: 'left',
      originY: 'top',
      latex: meta.latex,
      mathboardInkMode: meta.mathboardInkMode ?? INK_MODE_AUTO,
    })
  }

  /**
   * Recolor existing painted surfaces only (fill-only / stroke-only safe).
   * @returns {boolean} true when any paint changed
   */
  applyInk(color) {
    const changed = recolorPainted(this, color)
    if (changed) {
      this.dirty = true
    }
    return changed
  }

  toObject(propertiesToInclude = []) {
    return super.toObject([
      ...propertiesToInclude,
      'latex',
      'formulaType',
      'mathboardInkMode',
    ])
  }
}

FormulaObject.type = 'MathBoardFormula'
classRegistry.setClass(FormulaObject, FormulaObject.type)

function hasPaint(value) {
  return (
    value !== null
    && value !== undefined
    && value !== ''
    && value !== 'none'
    && value !== 'transparent'
  )
}

function recolorPainted(object, color) {
  let changed = false
  const children =
    typeof object.getObjects === 'function' ? object.getObjects() : null

  if (children?.length) {
    for (const child of children) {
      if (recolorPainted(child, color)) changed = true
    }
    return changed
  }

  const patch = {}
  if (hasPaint(object.fill)) patch.fill = color
  if (hasPaint(object.stroke)) patch.stroke = color

  if (Object.keys(patch).length) {
    object.set(patch)
    object.dirty = true
    changed = true
  }

  return changed
}

function lockDescendants(root) {
  const stack = typeof root.getObjects === 'function' ? [...root.getObjects()] : []
  while (stack.length) {
    const child = stack.pop()
    child.set?.({ selectable: false, evented: false })
    if (typeof child.getObjects === 'function') {
      stack.push(...child.getObjects())
    }
  }
}
