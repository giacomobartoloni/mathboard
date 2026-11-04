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

import { Point, util } from 'fabric'
import { snapPointToAngle } from './angleConstraints.js'

const ENDPOINTS = ['start', 'end']

// The Arrow Path is centered on pathOffset, while its semantic endpoints are
// expressed in the intrinsic path coordinate space.
export const arrowGeometryAdapter = {
  handles: ENDPOINTS,

  readHandle(arrow, id) {
    const x = id === 'start' ? arrow.x1 : arrow.x2
    const y = id === 'start' ? arrow.y1 : arrow.y2
    return util.transformPoint(
      new Point(x - arrow.pathOffset.x, y - arrow.pathOffset.y),
      arrow.calcTransformMatrix(),
    )
  },

  moveHandle(arrow, id, scenePoint, { shiftKey = false } = {}) {
    if (!ENDPOINTS.includes(id) || !Number.isFinite(scenePoint.x) || !Number.isFinite(scenePoint.y)) return false
    const opposite = id === 'start' ? 'end' : 'start'
    const target = shiftKey
      ? snapPointToAngle(this.readHandle(arrow, opposite), scenePoint)
      : scenePoint
    const matrix = arrow.calcTransformMatrix()
    const local = util.transformPoint(new Point(target.x, target.y), util.invertTransform(matrix))
    const endpoint = new Point(local.x + arrow.pathOffset.x, local.y + arrow.pathOffset.y)
    if (!Number.isFinite(endpoint.x) || !Number.isFinite(endpoint.y)) return false

    const start = id === 'start' ? endpoint : new Point(arrow.x1, arrow.y1)
    const end = id === 'end' ? endpoint : new Point(arrow.x2, arrow.y2)
    // A zero-length arrow has no valid path direction or terminal head.
    if (Math.hypot(end.x - start.x, end.y - start.y) < 1e-6) return false
    const previous = id === 'start'
      ? new Point(arrow.x1, arrow.y1) : new Point(arrow.x2, arrow.y2)
    if (previous.distanceFrom(endpoint) < 1e-8) return false

    const oldOffset = arrow.pathOffset
    arrow.setEndpoints({ x1: start.x, y1: start.y, x2: end.x, y2: end.y })
    // Preserve the stationary endpoint when the Path bounds/pathOffset change,
    // including for rotated, scaled, skewed, or flipped arrows.
    const center = util.transformPoint(new Point(
      arrow.pathOffset.x - oldOffset.x, arrow.pathOffset.y - oldOffset.y,
    ), matrix)
    arrow.setPositionByOrigin(center, 'center', 'center')
    arrow.setCoords()
    return true
  },
}
