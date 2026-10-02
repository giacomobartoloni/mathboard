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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { fromBase64Url } from './encode.js'
import {
  STAMP_ERROR_CODES,
  STAMP_MAX_BYTES,
  StampError,
  utf8ByteLength,
  validateStampDocument,
} from './schema.js'

/**
 * Decode a base64url stamp string into a validated document.
 */
export function decodeStampString(encoded) {
  if (typeof encoded !== 'string' || !encoded.trim()) {
    throw new StampError(STAMP_ERROR_CODES.EMPTY)
  }
  const trimmed = encoded.trim()

  let json
  try {
    const bytes = fromBase64Url(trimmed)
    json = typeof TextDecoder !== 'undefined'
      ? new TextDecoder().decode(bytes)
      : decodeURIComponent(escape(String.fromCharCode(...bytes)))
  } catch {
    throw new StampError(STAMP_ERROR_CODES.INVALID_ENCODING)
  }

  if (utf8ByteLength(json) > STAMP_MAX_BYTES) {
    throw new StampError(STAMP_ERROR_CODES.TOO_LARGE)
  }

  let doc
  try {
    doc = JSON.parse(json)
  } catch {
    throw new StampError(STAMP_ERROR_CODES.INVALID_JSON)
  }

  return validateStampDocument(doc)
}
