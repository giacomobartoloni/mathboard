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

import {
  BOARD_DOCUMENT_VERSION,
  BOARD_DOCUMENT_ERROR_CODES,
  BoardDocumentError,
} from './schema.js'

/**
 * Migrate a BoardDocument JSON to the current version.
 * V1 is identity. Future: v1 → v2 → current on semantic JSON only.
 */
export function migrateBoardDocument(doc) {
  if (!doc || typeof doc !== 'object') {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      'Root must be an object.',
    )
  }
  if (doc.version === BOARD_DOCUMENT_VERSION) {
    return doc
  }
  throw new BoardDocumentError(
    BOARD_DOCUMENT_ERROR_CODES.UNSUPPORTED_VERSION,
    `Got version ${JSON.stringify(doc.version)}.`,
  )
}
