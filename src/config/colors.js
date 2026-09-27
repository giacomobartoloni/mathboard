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

import { INK_MODE_FIXED } from './themes.js'

/**
 * Pen palette presets. These are document colors, not theme tokens.
 */

export const COLOR_PRESETS = [
  { id: 'black', label: 'Black', value: '#000000' },
  { id: 'white', label: 'White', value: '#ffffff' },
  { id: 'red', label: 'Red', value: '#d32f2f' },
  { id: 'blue', label: 'Blue', value: '#1976d2' },
  { id: 'green', label: 'Green', value: '#2e7d32' },
  { id: 'orange', label: 'Orange', value: '#ef6c00' },
  { id: 'purple', label: 'Purple', value: '#6a1b9a' },
  { id: 'yellow', label: 'Yellow', value: '#f9a825' },
]

export function normalizeHexColor(value) {
  if (typeof value !== 'string') return null
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim())
  return match ? `#${match[1].toLowerCase()}` : null
}

const STROKE_INK_TYPES = ['path', 'rect', 'circle', 'line']
const FILL_INK_TYPES = ['i-text', 'text']

/**
 * Ink change for one selected object. Strokes and shapes keep a transparent
 * fill; text uses fill. Formulas and anything else are left untouched.
 * Returns null when this object cannot take an explicit palette color.
 */
export function explicitInkPatch(object, color) {
  const normalized = normalizeHexColor(color)
  if (!object || typeof object !== 'object' || !normalized) return null
  if (object.formulaType) return null
  if (STROKE_INK_TYPES.includes(object.type)) {
    return { stroke: normalized, mathboardInkMode: INK_MODE_FIXED }
  }
  if (FILL_INK_TYPES.includes(object.type)) {
    return { fill: normalized, mathboardInkMode: INK_MODE_FIXED }
  }
  return null
}

/**
 * Apply a palette color to one object and lock it as explicit ink.
 * Returns false when nothing changed, so callers can skip a history entry.
 */
export function applyExplicitInk(object, color) {
  const patch = explicitInkPatch(object, color)
  if (!patch) return false
  const changed = Object.keys(patch).some((key) => object[key] !== patch[key])
  if (!changed) return false
  if (typeof object.set === 'function') object.set(patch)
  else Object.assign(object, patch)
  return true
}
