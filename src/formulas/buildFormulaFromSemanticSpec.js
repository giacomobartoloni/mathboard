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

import { INK_MODE_FIXED } from '../config/themes.js'
import { applyMaterializedFormulaMetadata } from './applyMaterializedFormulaMetadata.js'

/** Apply semantic Formula props after the renderer creates vector geometry. */
export async function buildFormulaFromSemanticSpec(spec, { render, defaultInk }) {
  const fixedInk = spec.mathboardInkMode === INK_MODE_FIXED
    ? [spec.fill, spec.stroke].find(paint => paint && paint !== 'none' && paint !== 'transparent')
    : null
  const formula = await render({ latex: spec.latex,
    position: { x: spec.left ?? 0, y: spec.top ?? 0 }, ink: fixedInk || defaultInk })
  if (!formula) return null
  const next = {}
  for (const key of ['left', 'top', 'scaleX', 'scaleY', 'skewX', 'skewY', 'angle',
    'flipX', 'flipY', 'originX', 'originY', 'opacity']) {
    if (spec[key] !== undefined && spec[key] !== null) next[key] = spec[key]
  }
  if (Object.keys(next).length) {
    formula.set(next)
    formula.setCoords()
  }
  if (fixedInk) formula.set('fill', fixedInk)
  applyMaterializedFormulaMetadata(formula, spec)
  return formula
}
