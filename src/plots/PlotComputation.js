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

import { PlotError } from './PlotError.js'
import { validatePlotSpec } from './plotSpec.js'

const deadlineError = () => Object.assign(new Error('Plot request timed out.'), { code: 'command_timeout' })
const cancelledError = () => new PlotError('cancelled', 'Graph preview cancelled.')
const limitError = () => new PlotError('computation_limit', 'Graph computation timed out. Try a simpler expression.')

/** One computation owns its worker; trusted API requests also have an absolute deadline. */
export async function computePlotAsync(spec, { signal, expiresAtMs } = {}) {
  const trusted = expiresAtMs !== undefined
  const expired = () => trusted && Date.now() >= expiresAtMs
  const cancelled = () => trusted ? deadlineError() : cancelledError()
  if (signal?.aborted || expired()) throw cancelled()
  validatePlotSpec(spec)
  if (signal?.aborted || expired()) throw cancelled()
  if (typeof Worker === 'undefined') {
    const { computePlot } = await import('./computePlot.js')
    if (signal?.aborted || expired()) throw cancelled()
    const result = computePlot(spec)
    if (signal?.aborted || expired()) throw cancelled()
    return result
  }
  return new Promise((resolve, reject) => {
    let worker, timer, settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (worker) {
        worker.onmessage = null
        worker.onerror = null
        worker.terminate()
      }
      error ? reject(error) : resolve(result)
    }
    const abort = () => finish(cancelled())
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted || expired()) return finish(cancelled())
    const remaining = trusted ? expiresAtMs - Date.now() : 10000
    if (remaining <= 0) return finish(cancelled())
    try {
      worker = new Worker(new URL('./plot.worker.js', import.meta.url), { type: 'module' })
      timer = setTimeout(() => finish(trusted ? deadlineError() : limitError()),
        Math.min(10000, remaining))
      worker.onmessage = ({ data }) => finish(
        data.error ? new PlotError(data.error.code, data.error.message) : null, data.result)
      worker.onerror = () => finish(
        new PlotError('evaluator_failure', 'Could not calculate this graph. Please try again.'))
      worker.postMessage(structuredClone(spec))
    } catch {
      finish(new PlotError('evaluator_failure', 'Could not calculate this graph. Please try again.'))
    }
  })
}
