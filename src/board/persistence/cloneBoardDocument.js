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

import { createMathBoardObjectId } from '../ids.js'
import { validateBoardDocument } from './schema.js'

function remapNode(node, idMap) {
  const nextId = createMathBoardObjectId()
  idMap.set(node.id, nextId)
  const next = { ...node, id: nextId }
  if (node.type === 'group' && Array.isArray(node.objects)) {
    next.objects = node.objects.map((child) => remapNode(child, idMap))
  }
  return next
}

/**
 * Deep-clone a BoardDocument with fresh object IDs (two-pass remap ready).
 * Board identity is not part of the document; callers mint a new board record id.
 */
export function cloneBoardDocumentWithFreshIds(doc) {
  const validated = validateBoardDocument(structuredClone(doc))
  const idMap = new Map()
  const objects = validated.objects.map((node) => remapNode(node, idMap))
  return {
    document: {
      ...validated,
      objects,
    },
    idMap,
  }
}
