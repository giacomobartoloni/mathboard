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

import { Control, Point, util } from 'fabric'
import { lineGeometryAdapter } from './lineGeometryAdapter.js'

const HANDLE_PREFIX = 'geometry-'
export { lineGeometryAdapter }

/** Future shape adapters provide handles, readHandle(object,id) and moveHandle(object,id,scenePoint). */
export function geometryControls(adapter) {
  return Object.fromEntries(adapter.handles.map((id) => [
    `${HANDLE_PREFIX}${id}`,
    new Control({
      actionName: 'modifyGeometry',
      cursorStyle: 'crosshair',
      // Larger touch hit area without increasing the painted handle size.
      touchSizeX: 44,
      touchSizeY: 44,
      positionHandler: (_dim, _matrix, object) => {
        const point = adapter.readHandle(object, id)
        return util.transformPoint(new Point(point.x, point.y), object.getViewportTransform())
      },
      actionHandler: (_event, transform, x, y) => {
        if (transform.mathboardCancelled) return false
        return adapter.moveHandle(transform.target, id, new Point(x, y))
      },
    }),
  ]))
}

export function isGeometryHandleTransform(transform) {
  return transform?.action === 'modifyGeometry'
    || (typeof transform?.corner === 'string' && transform.corner.startsWith(HANDLE_PREFIX))
}
