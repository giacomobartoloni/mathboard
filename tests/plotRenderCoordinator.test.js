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
import { createPlotRenderCoordinator } from '../src/plots/PlotRenderCoordinator.js'
import { computePlotAsync } from '../src/plots/PlotComputation.js'

const spec = {
  type: 'plot', syntax: 'latex-v1', latex: 'x',
  mathWindow: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
  frame: { width: 240, height: 160 }, axes: true, grid: true,
}
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('expired request is rejected before the lazy builder loads', async () => {
  let imports = 0
  const coordinator = createPlotRenderCoordinator(() => { imports++; return () => {} })
  const build = coordinator.forRequest({ expiresAtMs: Date.now() - 1 })
  await assert.rejects(build(spec), { code: 'command_timeout' })
  assert.equal(imports, 0)
})

test('only two API jobs are admitted; cancelled import does not start late rendering', async () => {
  const first = deferred(), second = deferred()
  let imported = 0, rendered = 0
  const coordinator = createPlotRenderCoordinator(() => {
    imported++
    return imported === 1 ? first.promise : second.promise
  })
  const ac = new AbortController()
  const deadline = Date.now() + 10000
  const one = coordinator.forRequest({ expiresAtMs: deadline, signal: ac.signal })(spec)
  const two = coordinator.forRequest({ expiresAtMs: deadline })(spec)
  await assert.rejects(
    coordinator.forRequest({ expiresAtMs: deadline })(spec), { code: 'board_busy' })
  ac.abort()
  await assert.rejects(one, { code: 'command_timeout' })
  // The first job still owns its slot until the unresolved import finishes.
  await assert.rejects(
    coordinator.forRequest({ expiresAtMs: deadline })(spec), { code: 'board_busy' })
  first.resolve(async () => { rendered++; return {} })
  await assert.rejects(one, { code: 'command_timeout' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(rendered, 0)
  second.resolve(async () => ({ dispose() {} }))
  await two
  assert.equal(imported, 2)
})

test('an aborted request terminates its worker and emits a timeout category', async () => {
  const previous = globalThis.Worker
  const worker = { terminated: 0, postMessage() {}, terminate() { this.terminated++ } }
  globalThis.Worker = class { constructor() { return worker } }
  const ac = new AbortController()
  try {
    const pending = computePlotAsync(spec, { signal: ac.signal, expiresAtMs: Date.now() + 10000 })
    ac.abort()
    await assert.rejects(pending, { code: 'command_timeout' })
    assert.equal(worker.terminated, 1)
  } finally {
    globalThis.Worker = previous
  }
})

test('pre-aborted and expired computation launches no worker', async () => {
  const previous = globalThis.Worker
  let launches = 0
  globalThis.Worker = class { constructor() { launches++ } }
  try {
    const ac = new AbortController()
    ac.abort()
    await assert.rejects(computePlotAsync(spec, { signal: ac.signal, expiresAtMs: Date.now() + 10000 }),
      { code: 'command_timeout' })
    await assert.rejects(computePlotAsync(spec, { expiresAtMs: Date.now() - 1 }),
      { code: 'command_timeout' })
    assert.equal(launches, 0)
  } finally {
    globalThis.Worker = previous
  }
})
