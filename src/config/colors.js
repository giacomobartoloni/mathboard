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
