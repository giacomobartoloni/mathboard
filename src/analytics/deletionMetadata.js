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

import { ANALYTICS_OBJECT_TYPES } from './events.js'

const COUNT_FIELD_BY_TYPE = Object.freeze({
  [ANALYTICS_OBJECT_TYPES.PATH]: 'path_count',
  [ANALYTICS_OBJECT_TYPES.SHAPE]: 'shape_count',
  [ANALYTICS_OBJECT_TYPES.TEXT]: 'text_count',
  [ANALYTICS_OBJECT_TYPES.FORMULA]: 'formula_count',
  [ANALYTICS_OBJECT_TYPES.GROUP]: 'group_count',
  [ANALYTICS_OBJECT_TYPES.UNKNOWN]: 'unknown_count',
})

/**
 * Build fixed-schema metadata for one object_deleted gesture.
 * @param {unknown[]} objects top-level deleted objects (no group recursion)
 * @param {(object: unknown) => string} getObjectType semantic classifier (e.g. kindOf)
 */
export function buildObjectDeletedMetadata(objects, getObjectType) {
  const counts = {
    path_count: 0,
    shape_count: 0,
    text_count: 0,
    formula_count: 0,
    group_count: 0,
    unknown_count: 0,
  }

  const presentTypes = new Set()

  objects.forEach((object) => {
    const candidate = getObjectType(object)
    const normalizedType = COUNT_FIELD_BY_TYPE[candidate]
      ? candidate
      : ANALYTICS_OBJECT_TYPES.UNKNOWN

    counts[COUNT_FIELD_BY_TYPE[normalizedType]] += 1
    presentTypes.add(normalizedType)
  })

  const objectType = presentTypes.size === 1
    ? presentTypes.values().next().value
    : ANALYTICS_OBJECT_TYPES.MIXED

  return {
    selection_count: objects.length,
    object_type: objectType,
    ...counts,
  }
}
