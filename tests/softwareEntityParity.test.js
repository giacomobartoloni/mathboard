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

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SOFTWARE_ID,
  assertSoftwareEntityParity,
  buildMathboardSoftwareEntity,
  softwareComparable,
} from '../seo/lib/structured-data.mjs'

test('buildMathboardSoftwareEntity returns a fresh object each call', () => {
  const a = buildMathboardSoftwareEntity()
  const b = buildMathboardSoftwareEntity()
  assert.notEqual(a, b)
  assert.deepEqual(a, b)
  assert.equal(a['@id'], SOFTWARE_ID)
})

test('softwareComparable ignores @type order', () => {
  const canonical = buildMathboardSoftwareEntity()
  const reordered = {
    ...canonical,
    '@type': ['WebApplication', 'SoftwareApplication'],
  }
  assert.deepEqual(softwareComparable(reordered), softwareComparable(canonical))
})

test('assertSoftwareEntityParity accepts matching root payload with @context', () => {
  const root = {
    '@context': 'https://schema.org',
    ...buildMathboardSoftwareEntity(),
  }
  assert.doesNotThrow(() => assertSoftwareEntityParity(root))
})

test('assertSoftwareEntityParity rejects drifted invariant fields', () => {
  const drifted = {
    ...buildMathboardSoftwareEntity(),
    license: 'wrong',
  }
  assert.throws(
    () => assertSoftwareEntityParity(drifted),
    /does not match canonical MathBoard software entity/,
  )
})
