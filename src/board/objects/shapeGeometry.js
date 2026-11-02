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

// Accepted SVG path command arities; lowercase commands are relative.
const PATH_ARITY = Object.freeze({
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
})

/** Locate the first malformed path field without coercing its coordinates. */
export function invalidPathField(path) {
  if (!Array.isArray(path) || !path.length) return 'path'
  for (const [index, segment] of path.entries()) {
    if (!Array.isArray(segment) || typeof segment[0] !== 'string') return `path[${index}]`
    const command = segment[0].toUpperCase()
    const arity = PATH_ARITY[command]
    if (segment[0].length !== 1 || arity === undefined
      || (index === 0 && command !== 'M')) return `path[${index}][0]`
    if (segment.length !== arity + 1) return `path[${index}]`
    for (let i = 1; i < segment.length; i++) {
      if (typeof segment[i] !== 'number' || !Number.isFinite(segment[i])) {
        return `path[${index}][${i}]`
      }
    }
    if (command === 'A') {
      for (const i of [1, 2]) {
        if (segment[i] < 0) return `path[${index}][${i}]`
      }
      for (const i of [4, 5]) {
        if (segment[i] !== 0 && segment[i] !== 1) return `path[${index}][${i}]`
      }
    }
  }
  return null
}

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
  if (node.type === 'arrow') {
    if (!['x1', 'y1', 'x2', 'y2'].every((key) => Number.isFinite(node[key]))) return false
    const length = Math.hypot(node.x2 - node.x1, node.y2 - node.y1)
    if (!Number.isFinite(length) || length <= 0) return false
    for (const key of ['headLength', 'headWidth']) {
      if (node[key] !== undefined && (!Number.isFinite(node[key]) || node[key] <= 0)) return false
    }
    return makeArrowPath(node).every((command) => command.slice(1).every(Number.isFinite))
  }
  return true
}

/** Intrinsic coordinates: one open shaft followed by one closed terminal head. */
export function makeArrowPath({ x1, y1, x2, y2, headLength = 16, headWidth = 12 }) {
  const length = Math.hypot(x2 - x1, y2 - y1)
  const ux = (x2 - x1) / length
  const uy = (y2 - y1) / length
  const effectiveHead = Math.min(headLength, length)
  const bx = x2 - ux * effectiveHead
  const by = y2 - uy * effectiveHead
  const nx = -uy * headWidth / 2
  const ny = ux * headWidth / 2
  return [['M', x1, y1], ['L', bx, by], ['M', bx + nx, by + ny],
    ['L', x2, y2], ['L', bx - nx, by - ny], ['Z']]
}
