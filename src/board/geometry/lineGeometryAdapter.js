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

/**
 * Fabric Line uses endpoints to choose direction but renders around its center.
 * Always work in that centered intrinsic frame and move the center with the
 * edited geometry; setting x1/y1 through Fabric.set() would recenter repeatedly.
 */
export const lineGeometryAdapter = {
  handles: ENDPOINTS,

  readHandle(line, id) {
    const points = line.calcLinePoints()
    const x = id === 'start' ? points.x1 : points.x2
    const y = id === 'start' ? points.y1 : points.y2
    return util.transformPoint(new Point(x, y), line.calcTransformMatrix())
  },

  moveHandle(line, id, scenePoint, { shiftKey = false } = {}) {
    if (!ENDPOINTS.includes(id) || !Number.isFinite(scenePoint.x) || !Number.isFinite(scenePoint.y)) return false
    // Snap in scene space (rather than the scaled/rotated local frame) so
    // 15-degree increments match the visible board angle at any transform.
    const opposite = id === 'start' ? 'end' : 'start'
    const target = shiftKey
      ? snapPointToAngle(this.readHandle(line, opposite), scenePoint)
      : scenePoint
    const matrix = line.calcTransformMatrix()
    const local = util.transformPoint(new Point(target.x, target.y), util.invertTransform(matrix))
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) return false
    const points = line.calcLinePoints()
    const fixed = id === 'start'
      ? new Point(points.x2, points.y2)
      : new Point(points.x1, points.y1)
    const moving = id === 'start'
      ? new Point(points.x1, points.y1)
      : new Point(points.x2, points.y2)
    if (Math.abs(moving.x - local.x) < 1e-8 && Math.abs(moving.y - local.y) < 1e-8) return false

    const start = id === 'start' ? local : fixed
    const end = id === 'end' ? local : fixed
    const center = util.transformPoint(
      new Point((start.x + end.x) / 2, (start.y + end.y) / 2), matrix,
    )

    // Atomic intrinsic update: bypass Line._set's per-coordinate recentering.
    line.x1 = start.x
    line.y1 = start.y
    line.x2 = end.x
    line.y2 = end.y
    line.width = Math.abs(end.x - start.x)
    line.height = Math.abs(end.y - start.y)
    line.setPositionByOrigin(center, 'center', 'center')
    line.setCoords()
    line.dirty = true
    return true
  },
}
