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

export class BoardReplacementRollbackError extends globalThis.AggregateError {
  constructor(cause, rollbackError) {
    super([cause, rollbackError], 'Board replacement and rollback failed.')
    this.name = 'BoardReplacementRollbackError'
  }
}

export class BoardReplacementCommitError extends Error {
  constructor(cause) {
    super(cause?.message || 'Board replacement could not finish.', { cause })
    this.name = 'BoardReplacementCommitError'
  }
}

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
 *   beforeInstall?: Function,
 * }} args
 */
export async function replaceBoardFromDocument({
  canvas,
  document: rawDoc,
  buildFormula,
  resetHistory,
  suspendHistory,
  afterReplace,
  beforeInstall,
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

  beforeInstall?.()

  if (typeof canvas.discardActiveObject === 'function') {
    canvas.discardActiveObject()
  }

  const setSuspend = typeof suspendHistory === 'function' ? suspendHistory : () => {}
  const current = canvas.getObjects().slice()
  setSuspend(true)
  let installError = null
  try {
    current.forEach((object) => canvas.remove(object))
    objects.forEach((object) => canvas.add(object))
  } catch (error) {
    try {
      canvas.getObjects().slice().forEach((object) => canvas.remove(object))
      current.forEach((object) => canvas.add(object))
    } catch (rollbackError) {
      installError = new BoardReplacementRollbackError(error, rollbackError)
    }
    if (!installError) installError = error
  }
  let resumeError = null
  try { setSuspend(false) } catch (error) {
    resumeError = error
  }
  if (resumeError) throw new BoardReplacementCommitError(resumeError)
  if (installError) throw installError

  try { resetHistory() } catch (error) {
    throw new BoardReplacementCommitError(error)
  }
  if (typeof canvas.requestRenderAll === 'function') {
    try { canvas.requestRenderAll() } catch (error) {
      console.error('Board repaint failed after replacement.', error)
    }
  }
  if (typeof afterReplace === 'function') {
    try { afterReplace(doc) } catch (error) {
      console.error('Board presentation failed after replacement.', error)
    }
  }
  return doc
}
