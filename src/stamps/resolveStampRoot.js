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

/**
 * Decide the Stamp root for a freshly materialized object list.
 *
 * A Formula may be implemented as a Fabric Group; only a semantic Board Group
 * counts as an existing Stamp wrapper and may be reused as-is.
 *
 * @param {object[]} objects
 * @param {{ isBoardGroup: (object: object) => boolean, wrap: (objects: object[]) => object }} options
 * @returns {object}
 */
export function resolveStampRoot(objects, { isBoardGroup, wrap }) {
  if (
    Array.isArray(objects)
    && objects.length === 1
    && isBoardGroup(objects[0])
  ) {
    return objects[0]
  }

  return wrap(objects)
}
