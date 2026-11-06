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
import { computePlotAsync } from '../src/plots/PlotComputation.js'
const spec = {
  type: 'plot',
  syntax: 'latex-v1',
  latex: 'x',
  mathWindow: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
  frame: { width: 480, height: 320 },
  axes: true,
  grid: true
}

test('aborting an outstanding graph computation terminates its worker', async () => {
  const previous = globalThis.Worker
  let worker
  globalThis.Worker = class {
    constructor() {
      worker = this
      this.terminated = false
    }
    postMessage() {}
    terminate() {
      this.terminated = true
    }
  }
  try {
    const abort = new AbortController(),
      pending = computePlotAsync(spec, { signal: abort.signal })
    abort.abort()
    await assert.rejects(pending, { code: 'cancelled' })
    assert.equal(worker.terminated, true)
  } finally {
    globalThis.Worker = previous
  }
})
test('worker load failures release resources and report a typed recoverable error', async () => {
  const previous = globalThis.Worker
  let worker
  globalThis.Worker = class {
    constructor() {
      worker = this
      this.terminated = false
    }
    postMessage() {}
    terminate() {
      this.terminated = true
    }
  }
  try {
    const pending = computePlotAsync(spec)
    worker.onerror()
    await assert.rejects(pending, { code: 'evaluator_failure' })
    assert.equal(worker.terminated, true)
  } finally {
    globalThis.Worker = previous
  }
})
