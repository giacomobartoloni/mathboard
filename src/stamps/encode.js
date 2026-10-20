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

import {
  STAMP_ERROR_CODES,
  STAMP_MAX_BYTES,
  StampError,
  utf8ByteLength,
  validateStampDocument,
} from './schema.js'

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function toBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function fromBase64Url(encoded) {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return base64ToBytes(padded + pad)
}

/**
 * Encode a validated stamp document to a portable base64url string.
 */
export function encodeStampDocument(doc) {
  const validated = validateStampDocument(doc)
  const json = JSON.stringify(validated)
  const size = utf8ByteLength(json)
  if (size > STAMP_MAX_BYTES) {
    throw new StampError(STAMP_ERROR_CODES.TOO_LARGE)
  }
  const bytes = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(json)
    : Uint8Array.from(unescape(encodeURIComponent(json)), (c) => c.charCodeAt(0))
  return toBase64Url(bytes)
}
