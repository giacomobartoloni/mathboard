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

import { Path, classRegistry } from 'fabric'
import { makeArrowPath } from './shapeGeometry.js'

/** Atomic semantic arrow; the Fabric path is a derived rendering artifact. */
export class ArrowObject extends Path {
  constructor(path, options = {}) {
    // Path.fromObject/clone passes the path first and serialized metadata second.
    // Always derive geometry from endpoints, never trust a stored rendering path.
    const { x1, y1, x2, y2, headLength = 16, headWidth = 12 } = options
    const geometry = { x1, y1, x2, y2, headLength, headWidth }
    super(makeArrowPath(geometry), {
      stroke: '#000000', fill: options.stroke ?? '#000000', strokeWidth: 2, ...options,
    })
    Object.assign(this, geometry, { mathboardShapeType: 'arrow' })
  }

  toObject(propertiesToInclude = []) {
    return super.toObject([...propertiesToInclude, 'mathboardShapeType',
      'x1', 'y1', 'x2', 'y2', 'headLength', 'headWidth'])
  }
}

ArrowObject.type = 'MathBoardArrow'
classRegistry.setClass(ArrowObject, ArrowObject.type)
