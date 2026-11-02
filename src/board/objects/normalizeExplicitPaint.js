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
 * An explicit paint is a fixed ink choice, unless the caller deliberately
 * requested automatic theme ink. Apply this rule to nested group members too.
 * This is shared by create and createMany; update already follows this rule.
 */
export function normalizeExplicitPaint(spec) {
  const node = { ...spec }
  const explicitColor = ['fill', 'stroke'].some(key => typeof node[key] === 'string'
    && node[key].trim() && !['none', 'transparent'].includes(node[key].trim().toLowerCase()))
  if (explicitColor && !('mathboardInkMode' in node)) {
    node.mathboardInkMode = 'fixed'
  }
  if (node.type === 'group') {
    node.objects = node.objects.map(normalizeExplicitPaint)
  }
  return node
}
