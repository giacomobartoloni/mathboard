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
import { readFileSync } from 'node:fs'

const configuration = JSON.parse(
  readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'),
)

test('Worker Previews provide separate R2 and rate-limit bindings', () => {
  const productionR2 = configuration.r2_buckets.find(item => item.binding === 'BOARD_SHARES')
  const previewR2 = configuration.previews?.r2_buckets?.find(item => item.binding === 'BOARD_SHARES')
  const productionLimiter = configuration.ratelimits.find(item => item.name === 'SHARE_RATE_LIMITER')
  const previewLimiter = configuration.previews?.ratelimits?.find(item => item.name === 'SHARE_RATE_LIMITER')

  assert.ok(productionR2)
  assert.ok(previewR2)
  assert.ok(productionLimiter)
  assert.ok(previewLimiter)
  assert.notEqual(previewR2.bucket_name, productionR2.bucket_name)
  assert.notEqual(previewLimiter.namespace_id, productionLimiter.namespace_id)
  assert.deepEqual(previewLimiter.simple, productionLimiter.simple)
  assert.deepEqual(productionLimiter.simple, { limit: 10, period: 60 })
  assert.deepEqual(previewLimiter.simple, { limit: 10, period: 60 })
})
