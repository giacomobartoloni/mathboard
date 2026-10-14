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

import { materializeBoardDocument } from './materializeBoardDocument.js'
import {
  BOARD_DOCUMENT_ERROR_CODES,
  BoardDocumentError,
} from './schema.js'

/**
 * Atomically replace canvas contents from a BoardDocument.
 * Materializes off-canvas first; on failure the current board is untouched.
 *
 * @param {{
 *   canvas: object,
 *   document: object,
 *   buildFormula: Function,
 *   resetHistory: Function,
 *   suspendHistory?: (flag: boolean) => void,
 *   afterReplace?: Function,
 * }} args
 */
export async function replaceBoardFromDocument({
  canvas,
  document: rawDoc,
  buildFormula,
  resetHistory,
  suspendHistory,
  afterReplace,
}) {
  if (!canvas || typeof canvas.getObjects !== 'function') {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      'Canvas is required.',
    )
  }
  if (typeof resetHistory !== 'function') {
    throw new BoardDocumentError(
      BOARD_DOCUMENT_ERROR_CODES.INVALID,
      'resetHistory is required.',
    )
  }

  const { document: doc, objects } = await materializeBoardDocument(rawDoc, {
    buildFormula,
  })

  if (typeof canvas.discardActiveObject === 'function') {
    canvas.discardActiveObject()
  }

  const setSuspend = typeof suspendHistory === 'function' ? suspendHistory : () => {}
  setSuspend(true)
  try {
    const current = canvas.getObjects().slice()
    current.forEach((object) => canvas.remove(object))
    objects.forEach((object) => canvas.add(object))
  } finally {
    setSuspend(false)
  }

  resetHistory()
  if (typeof canvas.requestRenderAll === 'function') {
    canvas.requestRenderAll()
  }
  if (typeof afterReplace === 'function') {
    afterReplace(doc)
  }
  return doc
}
