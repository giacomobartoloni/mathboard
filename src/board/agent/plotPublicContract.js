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

import { BOARD_CONTROLLER_ERROR_CODES as C, BoardControllerError } from '../BoardControllerError.js'
import { PLOT_KEYS, validatePlotSpec } from '../../plots/plotSpec.js'
import { TRANSFORM_KEYS } from '../objects/constants.js'

export const PUBLIC_PLOT_CREATE_FIELDS = Object.freeze([
  'type', 'id', ...TRANSFORM_KEYS, 'opacity', ...PLOT_KEYS,
])
const keys = new Set(PUBLIC_PLOT_CREATE_FIELDS)

function invalid() {
  throw new BoardControllerError(C.INVALID_SPEC, 'Invalid public plot specification.')
}

/** Only public API writes use this narrow boundary; stored nodes remain compatible. */
export function assertPublicPlotCreates(method, params) {
  if (method !== 'create' && method !== 'createMany') return
  const seen = new Set()
  const visit = node => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return
    if (seen.has(node)) invalid()
    seen.add(node)
    if (node.type === 'plot') {
      if (Object.keys(node).some(key => !keys.has(key))) invalid()
      if ('id' in node && (typeof node.id !== 'string' || !node.id.trim())) invalid()
      if ('opacity' in node && (!Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1)) invalid()
      try { validatePlotSpec(node) } catch { invalid() }
    } else if (node.type === 'group' && Array.isArray(node.objects)) {
      node.objects.forEach(visit)
    }
    seen.delete(node)
  }
  if (method === 'create') visit(params.spec)
  else if (Array.isArray(params.specs)) params.specs.forEach(visit)
}
