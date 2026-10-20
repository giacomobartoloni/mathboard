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

import { readSemanticBoardObject, toBoardDocumentNode } from '../objects/serialize.js'
import {
  BOARD_DOCUMENT_FORMAT,
  BOARD_DOCUMENT_VERSION,
  BOARD_DOCUMENT_ERROR_CODES,
  BoardDocumentError,
  validateBoardDocument,
} from './schema.js'

/**
 * Serialize the live Fabric canvas into a validated BoardDocument snapshot.
 * ActiveSelection itself is not persisted; member geometry uses canvas-plane coords.
 *
 * @param {{ canvas: object, boardObjectPolicy: object, title?: string }} args
 */
export function serializeBoardDocument({ canvas, boardObjectPolicy, title }) {
  if (!canvas || typeof canvas.getObjects !== 'function') {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      'Canvas is required.',
    )
  }

  const objects = []
  for (const object of canvas.getObjects()) {
    if (object?.isType?.('ActiveSelection', 'activeselection')) {
      continue
    }
    try {
      objects.push(
        toBoardDocumentNode(readSemanticBoardObject(object, {
          boardObjectPolicy,
          includeId: true,
          ensureId: true,
        })),
      )
    } catch (error) {
      throw new BoardDocumentError(
        BOARD_DOCUMENT_ERROR_CODES.INVALID,
        error?.message || String(error),
      )
    }
  }

  const doc = {
    format: BOARD_DOCUMENT_FORMAT,
    version: BOARD_DOCUMENT_VERSION,
    title: typeof title === 'string' ? title : 'Untitled board',
    objects,
  }
  return validateBoardDocument(doc)
}
