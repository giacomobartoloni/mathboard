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

import { materializeBoardObjects } from '../board/objects/materialize.js'
import { STAMP_ERROR_CODES, StampError } from './schema.js'

/**
 * Build Fabric objects from a validated stamp document.
 * Formula nodes require `buildFormula({ latex, left, top, ... })` which must
 * return a Fabric formula object (or null / throw on failure).
 *
 * Stamp import does not restore IDs — callers assign fresh identity.
 *
 * @param {object} doc validated stamp document
 * @param {{ buildFormula: Function }} options
 * @returns {Promise<import('fabric').FabricObject[]>}
 */
export async function materializeStampDocument(doc, options = {}) {
  const buildFormula = options.buildFormula
  if (typeof buildFormula !== 'function') {
    throw new StampError(
      STAMP_ERROR_CODES.MATERIALIZE_FAILED,
      'Formula builder is required.',
    )
  }

  try {
    return await materializeBoardObjects(doc.objects, {
      buildFormula,
      restoreIds: false,
    })
  } catch (error) {
    if (error instanceof StampError) throw error
    if (error?.message === 'Formula render failed.') {
      throw new StampError(STAMP_ERROR_CODES.FORMULA_RENDER_FAILED)
    }
    if (error?.message?.includes('Cannot materialize')) {
      throw new StampError(STAMP_ERROR_CODES.UNKNOWN_TYPE, error.message)
    }
    throw new StampError(
      STAMP_ERROR_CODES.MATERIALIZE_FAILED,
      error?.message || String(error),
    )
  }
}
