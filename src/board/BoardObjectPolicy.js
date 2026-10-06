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

import { FORMULA_TYPE } from '../formulas/constants.js'
import {
  DRAWABLE_CAPABILITIES,
  FORMULA_CAPABILITIES,
  GROUP_CAPABILITIES,
  TEXT_CAPABILITIES,
  UNKNOWN_CAPABILITIES,
} from './capabilities.js'

/**
 * MathBoard semantic kinds. Distinct from Fabric runtime types: a future
 * Formula may be a Fabric Group while remaining kind `formula`.
 */
export const BOARD_OBJECT_KINDS = Object.freeze({
  FORMULA: 'formula',
  GROUP: 'group',
  ACTIVE_SELECTION: 'activeSelection',
  TEXT: 'text',
  PATH: 'path',
  SHAPE: 'shape',
  UNKNOWN: 'unknown',
})

function isFabricType(object, ...types) {
  if (!object) return false

  if (typeof object.isType === 'function') {
    return object.isType(...types)
  }

  const actual = String(object.type || '').toLowerCase()
  return types.some((type) => type.toLowerCase() === actual)
}

/**
 * Translates a Fabric runtime object into MathBoard product semantics.
 * Stateless today; kept as a class so callers share one semantic owner.
 */
export class BoardObjectPolicy {
  isActiveSelection(object) {
    return isFabricType(object, 'ActiveSelection', 'activeselection')
  }

  isFormula(object) {
    if (!object || this.isActiveSelection(object)) {
      return false
    }

    if (object.formulaType === FORMULA_TYPE) {
      return true
    }

    return (
      object.objectKind === BOARD_OBJECT_KINDS.FORMULA
      && typeof object.latex === 'string'
    )
  }

  isBoardGroup(object) {
    return Boolean(
      object
      && !this.isActiveSelection(object)
      && !this.isFormula(object)
      && isFabricType(object, 'Group', 'group'),
    )
  }

  isText(object) {
    return isFabricType(object, 'IText', 'Text', 'Textbox')
  }

  isPath(object) {
    return isFabricType(object, 'Path')
  }

  isShape(object) {
    return isFabricType(
      object,
      'Rect',
      'Circle',
      'Ellipse',
      'Line',
      'Triangle',
      'Polyline',
      'Polygon',
    )
  }

  /**
   * Order is binding: Formula must precede Group so a future Formula Group
   * is never misclassified as a board Group.
   */
  kindOf(object) {
    if (!object) return null

    if (this.isActiveSelection(object)) {
      return BOARD_OBJECT_KINDS.ACTIVE_SELECTION
    }

    if (this.isFormula(object)) {
      return BOARD_OBJECT_KINDS.FORMULA
    }

    if (this.isBoardGroup(object)) {
      return BOARD_OBJECT_KINDS.GROUP
    }

    if (this.isText(object)) {
      return BOARD_OBJECT_KINDS.TEXT
    }

    if (this.isPath(object)) {
      return BOARD_OBJECT_KINDS.PATH
    }

    if (this.isShape(object)) {
      return BOARD_OBJECT_KINDS.SHAPE
    }

    return BOARD_OBJECT_KINDS.UNKNOWN
  }

  capabilitiesOf(object) {
    switch (this.kindOf(object)) {
      case BOARD_OBJECT_KINDS.FORMULA:
        return FORMULA_CAPABILITIES

      case BOARD_OBJECT_KINDS.GROUP:
        return GROUP_CAPABILITIES

      case BOARD_OBJECT_KINDS.TEXT:
        return TEXT_CAPABILITIES

      case BOARD_OBJECT_KINDS.PATH:
      case BOARD_OBJECT_KINDS.SHAPE:
        return DRAWABLE_CAPABILITIES

      default:
        return UNKNOWN_CAPABILITIES
    }
  }
}
