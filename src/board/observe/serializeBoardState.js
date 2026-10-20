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

import { getMathBoardObjectId } from '../ids.js'
import { readSemanticBoardObject, toBoardDocumentNode } from '../objects/serialize.js'

/** Read-only scene observation, independent of history and persistence format. */
export function serializeBoardState({ canvas, boardObjectPolicy, boardId = null }) {
  return {
    version: 1,
    boardId,
    viewport: {
      zoom: canvas.getZoom(),
      width: canvas.getWidth(),
      height: canvas.getHeight(),
      transform: canvas.viewportTransform.slice(),
    },
    selection: { ids: canvas.getActiveObjects().map(getMathBoardObjectId).filter(Boolean) },
    objects: canvas.getObjects().map((object) => {
      const semantic = toBoardDocumentNode(readSemanticBoardObject(object, { boardObjectPolicy, ensureId: false }))
      // Fabric getBoundingRect uses scene corners, including an ActiveSelection's transform.
      const rectangle = object.getBoundingRect()
      const bounds = {}
      for (const key of ['left', 'top', 'width', 'height']) {
        bounds[key] = Number.isFinite(rectangle[key]) ? rectangle[key] : 0
      }
      return structuredClone({ ...semantic, bounds })
    }),
  }
}
