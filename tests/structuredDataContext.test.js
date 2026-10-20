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
  SCHEMA_CONTEXT,
  assertSchemaContext,
} from '../seo/lib/structured-data.mjs'

test('assertSchemaContext accepts schema.org context', () => {
  assert.doesNotThrow(() =>
    assertSchemaContext({
      '@context': SCHEMA_CONTEXT,
    }),
  )
})

test('assertSchemaContext rejects missing context', () => {
  assert.throws(() => assertSchemaContext({}), /@context/)
})

test('assertSchemaContext rejects non-schema.org context', () => {
  assert.throws(
    () =>
      assertSchemaContext({
        '@context': 'https://example.com/schema',
      }),
    /schema.org/,
  )
})
