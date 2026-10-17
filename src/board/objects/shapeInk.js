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

/** New semantic shapes share one painted-surface AUTO policy. */
export function isExtendedShape(object) {
  return Boolean(object?.isType?.('Ellipse'))
}

export function hasPaint(value) {
  return value !== null && value !== undefined && value !== '' && value !== 'none' && value !== 'transparent'
}

export function extendedShapeInkPatch(object, color) {
  if (!isExtendedShape(object)) return null
  const patch = {}
  for (const key of ['stroke', 'fill']) {
    if (hasPaint(object[key])) patch[key] = color
  }
  return patch
}
