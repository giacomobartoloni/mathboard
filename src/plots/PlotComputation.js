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

/** Each request owns its worker, so abort and timeout actually stop computation. */
export async function computePlotAsync(spec, { signal } = {}) {
  validatePlotSpec(spec)
  if (signal?.aborted) throw new PlotError('cancelled', 'Graph preview cancelled.')
  if (typeof Worker === 'undefined') return (await import('./computePlot.js')).computePlot(spec)
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./plot.worker.js', import.meta.url), { type: 'module' })
    const finish = (error, result) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      error ? reject(error) : resolve(result)
    }
    const abort = () => finish(new PlotError('cancelled', 'Graph preview cancelled.'))
    const timer = setTimeout(
      () =>
        finish(
          new PlotError(
            'computation_limit',
            'Graph computation timed out. Try a simpler expression.'
          )
        ),
      10000
    )
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }) =>
      finish(data.error ? new PlotError(data.error.code, data.error.message) : null, data.result)
    worker.onerror = () =>
      finish(
        new PlotError('evaluator_failure', 'Could not calculate this graph. Please try again.')
      )
    worker.postMessage(structuredClone(spec))
  })
}
