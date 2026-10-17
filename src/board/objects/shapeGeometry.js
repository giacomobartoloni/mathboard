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

/** Shared geometry checks at create, document and Stamp boundaries. */
export function hasValidShapeGeometry(node) {
  if (node.type === 'ellipse') {
    return ['rx', 'ry'].every((key) => Number.isFinite(node[key]) && node[key] >= 0)
  }
  if (node.type === 'polygon') {
    return Array.isArray(node.points) && node.points.length >= 3 && node.points.length <= 1000
      && Array.from(node.points).every((point) => point && typeof point === 'object'
        && Number.isFinite(point.x) && Number.isFinite(point.y))
  }
  return true
}
