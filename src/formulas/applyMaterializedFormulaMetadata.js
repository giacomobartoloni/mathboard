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
 * Apply Stamp semantic metadata onto a freshly rematerialized formula.
 *
 * `mathboardInkMode` is product state (AUTO/FIXED) and survives rematerialization.
 * `mathboardRenderedInkIsLight` is legacy bitmap-renderer polarity; ignore it so
 * vector formulas (and rematerialized AUTO ink) are not skewed by old Stamps.
 *
 * @param {object} formula Fabric formula object from the current renderer
 * @param {object} spec Stamp formula node (may still carry legacy polarity)
 * @returns {object} the same formula instance
 */
export function applyMaterializedFormulaMetadata(formula, spec) {
  if (!formula || !spec) return formula

  if (spec.mathboardInkMode !== undefined) {
    formula.mathboardInkMode = spec.mathboardInkMode
  }

  // Deliberately do NOT restore mathboardRenderedInkIsLight from the Stamp.
  return formula
}
