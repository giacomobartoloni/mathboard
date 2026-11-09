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

/** Public readback metadata only; never add it to history or BoardDocuments. */
export function withPlotStatus(node, object, policy) {
  const result = structuredClone(node)
  if (policy.isPlot(object)) {
    if (['ok', 'partial', 'no_real_samples'].includes(object.plotStatus)) result.plotStatus = object.plotStatus
  } else if (policy.isBoardGroup(object) && Array.isArray(result.objects)) {
    const children = object.getObjects()
    result.objects = result.objects.map((child, index) =>
      withPlotStatus(child, children[index], policy))
  }
  return result
}
