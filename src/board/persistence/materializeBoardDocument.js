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

import { materializeBoardObjects } from '../objects/materialize.js'
import { migrateBoardDocument } from './migrateBoardDocument.js'
import {
  BOARD_DOCUMENT_ERROR_CODES,
  BoardDocumentError,
  validateBoardDocument,
} from './schema.js'

/**
 * Migrate + validate + materialize a BoardDocument off-canvas.
 * Does not modify the live canvas.
 *
 * @param {object} rawDoc
 * @param {{ buildFormula: Function }} options
 * @returns {Promise<{ document: object, objects: object[] }>}
 */
export async function materializeBoardDocument(rawDoc, options = {}) {
  const buildFormula = options.buildFormula
  if (typeof buildFormula !== 'function') {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.MATERIALIZE_FAILED,
      'Formula builder is required.',
    )
  }

  let doc
  try {
    doc = validateBoardDocument(migrateBoardDocument(rawDoc))
  } catch (error) {
    if (error instanceof BoardDocumentError) throw error
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      error?.message || String(error),
    )
  }

  try {
    const objects = await materializeBoardObjects(doc.objects, {
      buildFormula,
      restoreIds: true,
    })
    return { document: doc, objects }
  } catch (error) {
    if (error instanceof BoardDocumentError) throw error
    if (error?.message === 'Formula render failed.') {
      throw new BoardDocumentError(BOARD_DOCUMENT_ERROR_CODES.FORMULA_RENDER_FAILED)
    }
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.MATERIALIZE_FAILED,
      error?.message || String(error),
    )
  }
}
