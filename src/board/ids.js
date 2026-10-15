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

import { BoardObjectPolicy } from './BoardObjectPolicy.js'

const ID_PREFIX = 'mbobj_'
const defaultPolicy = new BoardObjectPolicy()

/**
 * @returns {string} mbobj_<uuid>
 */
export function createMathBoardObjectId() {
  return `${ID_PREFIX}${globalThis.crypto.randomUUID()}`
}

/**
 * @param {object|null|undefined} object
 * @returns {string|null}
 */
export function getMathBoardObjectId(object) {
  if (!object) return null
  const id = object.mathboardId
  return typeof id === 'string' && id.length > 0 ? id : null
}

/**
 * Ensure `object.mathboardId` exists. Prefer `preferredId` when present and non-empty.
 * @param {object} object
 * @param {string} [preferredId]
 * @returns {string}
 */
export function ensureMathBoardObjectId(object, preferredId) {
  if (!object) {
    throw new Error('ensureMathBoardObjectId requires an object')
  }
  const preferred =
    typeof preferredId === 'string' && preferredId.length > 0 ? preferredId : null
  if (preferred) {
    object.mathboardId = preferred
    return preferred
  }
  const existing = getMathBoardObjectId(object)
  if (existing) return existing
  const next = createMathBoardObjectId()
  object.mathboardId = next
  return next
}

function walkFreshIds(object, boardObjectPolicy) {
  if (!object) return
  object.mathboardId = createMathBoardObjectId()
  if (boardObjectPolicy.isBoardGroup(object)) {
    object.getObjects().forEach((child) => walkFreshIds(child, boardObjectPolicy))
  }
}

/**
 * Assign fresh IDs to every object in a tree (including group children).
 * Formula trees are atomic — only the formula root gets an ID.
 * Used for Stamp import and board copy.
 * @param {object|object[]} objects
 */
export function regenerateMathBoardObjectIds(objects, { boardObjectPolicy = defaultPolicy } = {}) {
  const list = Array.isArray(objects) ? objects : [objects]
  list.forEach((object) => walkFreshIds(object, boardObjectPolicy))
}
