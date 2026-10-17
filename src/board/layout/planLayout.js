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

import { BoardControllerError, BOARD_CONTROLLER_ERROR_CODES as C } from '../BoardControllerError.js'
const invalid = (message) => { throw new BoardControllerError(C.INVALID_SPEC, message) }
export function validateLayoutOptions(options) {
  const allowed = ['ids', 'direction', 'gap', 'margin', 'left', 'top']
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(k => !allowed.includes(k))) invalid('Invalid layout options.')
  if (!Array.isArray(options.ids) || !options.ids.length || Array.from(options.ids).some(id => typeof id !== 'string' || !id.trim())
    || new Set(options.ids).size !== options.ids.length) invalid('Layout requires distinct top-level IDs.')
  if (options.direction !== undefined && !['stack', 'row'].includes(options.direction)) invalid('Layout direction must be stack or row.')
  for (const key of ['gap', 'margin', 'left', 'top']) {
    if (key in options && (!Number.isFinite(options[key]) || (['gap', 'margin'].includes(key) && options[key] < 0))) invalid('Layout coordinates and spacing must be finite.')
  }
}
export function unionBounds(bounds) {
  const left = Math.min(...bounds.map(b => b.left)), top = Math.min(...bounds.map(b => b.top))
  return { left, top, width: Math.max(...bounds.map(b => b.left + b.width)) - left,
    height: Math.max(...bounds.map(b => b.top + b.height)) - top }
}
/** A rectangular viewport clear area maps exactly under the board's pan/zoom. */
export function sceneSafeArea(canvas, area, margin) {
  const [a, b, c, d, e, f] = canvas.viewportTransform
  if (![a,b,c,d,e,f].every(Number.isFinite) || a <= 0 || d <= 0 || b !== 0 || c !== 0) invalid('Layout requires a pan/zoom viewport.')
  if (!area || !['left','top','width','height'].every(k => Number.isFinite(area[k])) || area.width < 0 || area.height < 0) invalid('Invalid viewport safe area.')
  const left = Math.max(0, area.left) + margin, top = Math.max(0, area.top) + margin
  const right = Math.min(canvas.getWidth(), area.left + area.width) - margin
  const bottom = Math.min(canvas.getHeight(), area.top + area.height) - margin
  if (right < left || bottom < top) invalid('Viewport has no usable layout area.')
  return { left: (left-e)/a, top: (top-f)/d, width: (right-left)/a, height: (bottom-top)/d }
}
/** Plan translations from rendered AABBs; never mutate the live objects. */
export function planLayout(bounds, options, safeArea) {
  if (bounds.some(b => !['left','top','width','height'].every(k => Number.isFinite(b[k])) || b.width < 0 || b.height < 0)) invalid('Cannot lay out nonfinite geometry.')
  const direction = options.direction ?? 'stack', gap = options.gap ?? 24
  const left = options.left ?? safeArea.left, top = options.top ?? safeArea.top
  let cursor = direction === 'stack' ? top : left
  const placements = bounds.map(b => {
    const next = { ...b, left: direction === 'stack' ? left : cursor, top: direction === 'stack' ? cursor : top }
    cursor += (direction === 'stack' ? b.height : b.width) + gap
    return next
  })
  const union = unionBounds(placements), epsilon = 1e-7
  if (union.left < safeArea.left-epsilon || union.top < safeArea.top-epsilon
    || union.left+union.width > safeArea.left+safeArea.width+epsilon
    || union.top+union.height > safeArea.top+safeArea.height+epsilon) invalid('Layout does not fit the workspace safe area.')
  return placements
}
