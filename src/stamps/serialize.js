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

import { BoardObjectPolicy } from '../board/BoardObjectPolicy.js'
import { readSemanticBoardObject, toStampNode } from '../board/objects/serialize.js'
import { STAMP_VERSION, STAMP_ERROR_CODES, StampError } from './schema.js'
import { encodeStampDocument } from './encode.js'

const boardObjectPolicy = new BoardObjectPolicy()

/**
 * Serialize one Fabric object (or permanent Group) to a stamp node.
 * ActiveSelection is not a stamp node — callers should pass members.
 * Stamp transfer omits identity (fresh IDs on import).
 */
export function serializeFabricObject(object) {
  try {
    const semantic = readSemanticBoardObject(object, {
      boardObjectPolicy,
      includeId: false,
    })
    return toStampNode(semantic)
  } catch (error) {
    if (error?.message?.includes('ActiveSelection')) {
      throw new StampError(
        STAMP_ERROR_CODES.INVALID_SHAPE,
        'ActiveSelection cannot be serialized; export its members.',
      )
    }
    if (error?.message?.includes('missing latex')) {
      throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, 'Formula is missing latex.')
    }
    if (error?.message?.includes('Cannot export')) {
      throw new StampError(
        STAMP_ERROR_CODES.UNKNOWN_TYPE,
        error.message.replace('Cannot export object type ', 'Cannot export object type '),
      )
    }
    if (error?.message?.includes('Missing object')) {
      throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, 'Missing object.')
    }
    throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, error?.message || String(error))
  }
}

export function stampDocumentFromObjects(objects) {
  if (!Array.isArray(objects) || objects.length < 1) {
    throw new StampError(
      STAMP_ERROR_CODES.INVALID_SHAPE,
      'At least one object is required.',
    )
  }
  return {
    version: STAMP_VERSION,
    objects: objects.map((object) => serializeFabricObject(object)),
  }
}

export function encodeObjectsAsStamp(objects) {
  return encodeStampDocument(stampDocumentFromObjects(objects))
}
