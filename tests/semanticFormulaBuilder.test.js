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

import test from 'node:test'
import assert from 'node:assert/strict'
import { Path } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { FormulaObject } from '../src/formulas/FormulaObject.js'
import { buildFormulaFromSemanticSpec } from '../src/formulas/buildFormulaFromSemanticSpec.js'

installFabricDomStub()

test('semantic formula builder preserves transform and fixed ink without UI state', async () => {
  const inputs = []
  const formula = await buildFormulaFromSemanticSpec({ latex: 'x^2', left: 12, top: 30,
    scaleX: 1.5, angle: 20, fill: '#123456', mathboardInkMode: 'fixed' }, {
    defaultInk: '#000000',
    render: async input => {
      inputs.push(input)
      return new FormulaObject([new Path('M 0 0 L 20 20')], { latex: input.latex })
    },
  })
  assert.equal(inputs[0].ink, '#123456')
  assert.equal(formula.left, 12)
  assert.equal(formula.top, 30)
  assert.equal(formula.scaleX, 1.5)
  assert.equal(formula.angle, 20)
  assert.equal(formula.mathboardInkMode, 'fixed')
})
