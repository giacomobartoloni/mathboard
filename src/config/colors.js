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

import { INK_MODE_AUTO, INK_MODE_FIXED } from './themes.js'

// Objects whose board ink lives on "stroke" (pencil strokes, shapes).
const STROKE_INK_TYPES = ['path', 'rect', 'circle', 'line']
// Objects whose board ink lives on "fill".
const FILL_INK_TYPES = ['i-text', 'text']

/**
 * Pen palette presets. `main` is automatic board ink (null value): black on
 * the light board, a light ink on dark and chalkboard. The other presets are
 * fixed document colors.
 */
export const COLOR_PRESETS = [
  { id: 'main', label: 'Main', value: null },
  { id: 'red', label: 'Red', value: '#d32f2f' },
  { id: 'yellow', label: 'Yellow', value: '#ffeb3b' },
  { id: 'blue', label: 'Blue', value: '#1976d2' },
  { id: 'green', label: 'Green', value: '#2e7d32' },
]

export function normalizeHexColor(value) {
  if (typeof value !== 'string') return null
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim())
  return match ? `#${match[1].toLowerCase()}` : null
}

/**
 * Palette value implied by one board object for the toolbar color state.
 * Returns a lowercase hex when the object carries fixed ink, null when it
 * uses automatic board ink, and undefined when the object has no readable
 * palette ink (formulas, unknown types, invalid color strings).
 */
export function paletteColorFromObject(object) {
  if (!object || typeof object !== 'object') return undefined
  if (object.formulaType) return undefined

  let raw = null
  if (STROKE_INK_TYPES.includes(object.type)) raw = object.stroke
  else if (FILL_INK_TYPES.includes(object.type)) raw = object.fill
  else return undefined

  if (object.mathboardInkMode !== INK_MODE_FIXED) return null
  const hex = normalizeHexColor(raw)
  return hex === null ? undefined : hex
}

/**
 * Palette value for a multi-object selection. Returns a shared hex or null
 * when every readable member agrees; undefined when the selection is empty,
 * unreadable, or mixed so the toolbar should keep its current color.
 */
export function paletteColorFromSelection(objects) {
  if (!Array.isArray(objects) || objects.length === 0) return undefined

  let agreed
  let hasReadable = false
  for (const object of objects) {
    const color = paletteColorFromObject(object)
    if (color === undefined) continue
    if (!hasReadable) {
      agreed = color
      hasReadable = true
      continue
    }
    if (agreed !== color) return undefined
  }
  return hasReadable ? agreed : undefined
}

function inkPatchForType(object, color, inkMode) {
  const normalized = normalizeHexColor(color)
  if (!object || typeof object !== 'object' || !normalized) return null
  if (object.formulaType) return null
  if (STROKE_INK_TYPES.includes(object.type)) {
    return { stroke: normalized, mathboardInkMode: inkMode }
  }
  if (FILL_INK_TYPES.includes(object.type)) {
    return { fill: normalized, mathboardInkMode: inkMode }
  }
  return null
}

function applyInkPatch(object, patch) {
  if (!patch) return false
  const changed = Object.keys(patch).some((key) => object[key] !== patch[key])
  if (!changed) return false
  if (typeof object.set === 'function') object.set(patch)
  else Object.assign(object, patch)
  return true
}

/**
 * Ink change for one selected object. Strokes and shapes keep a transparent
 * fill; text uses fill. Formulas and anything else are left untouched.
 * Returns null when this object cannot take an explicit palette color.
 */
export function explicitInkPatch(object, color) {
  return inkPatchForType(object, color, INK_MODE_FIXED)
}

/**
 * Apply a palette color to one object and lock it as explicit ink.
 * Returns false when nothing changed, so callers can skip a history entry.
 */
export function applyExplicitInk(object, color) {
  return applyInkPatch(object, explicitInkPatch(object, color))
}

/**
 * Restore automatic board ink on one object so it follows theme changes again.
 * Returns false when nothing changed.
 */
export function applyAutoInk(object, defaultInk) {
  return applyInkPatch(object, inkPatchForType(object, defaultInk, INK_MODE_AUTO))
}
