/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import {
  BOARD_DOCUMENT_ERROR_CODES,
  BOARD_DOCUMENT_MAX_BYTES,
  validateBoardDocument,
} from './schema.js'

export class BoardFileImportError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'BoardFileImportError'
    this.code = code
  }
}

/** Read and validate one local BoardDocument without importing it into a workspace. */
export async function readBoardDocumentFile(files) {
  if (!Array.isArray(files) || files.length !== 1) {
    throw new BoardFileImportError('file_count', 'Choose one .mathboard file at a time.')
  }
  const file = files[0]
  if (!file || typeof file.name !== 'string' || !/\.mathboard(?:\.json)?$/i.test(file.name)) {
    throw new BoardFileImportError('extension', 'Choose a .mathboard file.')
  }
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > BOARD_DOCUMENT_MAX_BYTES) {
    throw new BoardFileImportError('too_large', 'This file is too large to import (8 MB maximum).')
  }
  let text
  try { text = await file.text() }
  catch { throw new BoardFileImportError('read', 'Could not read this file. Please try again.') }

  let document
  try { document = JSON.parse(text.replace(/^\uFEFF/, '')) }
  catch { throw new BoardFileImportError('invalid', 'This is not a valid MathBoard board file.') }

  try { return validateBoardDocument(document) }
  catch (error) {
    if (error?.code === BOARD_DOCUMENT_ERROR_CODES.UNSUPPORTED_VERSION) {
      throw new BoardFileImportError('version', 'This MathBoard file uses an unsupported version.')
    }
    if (error?.code === BOARD_DOCUMENT_ERROR_CODES.TOO_LARGE) {
      throw new BoardFileImportError('too_large', 'This file is too large to import (8 MB maximum).')
    }
    throw new BoardFileImportError('invalid', 'This is not a valid MathBoard board file.')
  }
}
