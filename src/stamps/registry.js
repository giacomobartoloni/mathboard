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

import { encodeStampDocument } from './encode.js'
import { buildCartesianPlaneDocument } from './kits/cartesianPlane.js'
import { buildUnitCircleDocument } from './kits/unitCircle.js'

const KITS = {
  cartesianPlane: {
    id: 'cartesianPlane',
    label: 'Cartesian plane',
    category: 'stamp',
    buildDocument: buildCartesianPlaneDocument,
  },
  unitCircle: {
    id: 'unitCircle',
    label: 'Unit circle',
    category: 'stamp',
    buildDocument: buildUnitCircleDocument,
  },
}

const encodedCache = new Map()

export function listKits() {
  return Object.values(KITS).map(({ id, label, category }) => ({ id, label, category }))
}

export function getKitMeta(kitId) {
  const kit = KITS[kitId]
  if (!kit) return null
  return { id: kit.id, label: kit.label, category: kit.category }
}

/**
 * Return the portable base64url stamp string for a built-in kit.
 */
export function getKitById(kitId) {
  const kit = KITS[kitId]
  if (!kit) {
    throw new Error(`Unknown kit id: ${kitId}`)
  }
  if (!encodedCache.has(kitId)) {
    encodedCache.set(kitId, encodeStampDocument(kit.buildDocument()))
  }
  return encodedCache.get(kitId)
}
