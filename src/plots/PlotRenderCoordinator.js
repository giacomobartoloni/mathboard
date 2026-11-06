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

import { disposeMaterializedObject } from '../board/objects/materialize.js'

const requestError = () => Object.assign(new Error('Plot request timed out.'), { code: 'command_timeout' })
const busyError = () => Object.assign(new Error('Plot rendering is busy.'), { code: 'board_busy' })
const plotErrorCodes = Object.freeze({
  invalid_expression: ['plot_invalid_expression', 'Invalid plot expression.'],
  unsupported_expression: ['plot_unsupported_expression', 'Unsupported plot expression.'],
  no_real_samples: ['plot_no_real_samples', 'No real plot samples were found in this interval.'],
  computation_limit: ['plot_computation_limit', 'Plot computation exceeded its limits.'],
  evaluator_failure: ['plot_render_failed', 'Plot rendering failed.'],
})
function classifyPlotError(error) {
  const result = plotErrorCodes[error?.code]
  if (!result) return error
  return Object.assign(new Error(result[1]), { code: result[0] })
}

/**
 * One application-level bound for API rendering. UI preview and ordinary document
 * loading retain their existing worker lifecycle and are not admitted here.
 */
export function createPlotRenderCoordinator(
  loadBuilder = () => import('./buildPlotObject.js').then(module => module.buildPlotObject)
) {
  let activeJobs = 0
  return {
    forRequest({ signal, expiresAtMs, guard = () => {} }) {
      return async spec => {
        guard()
        if (signal?.aborted || !Number.isSafeInteger(expiresAtMs) || Date.now() >= expiresAtMs)
          throw requestError()
        if (activeJobs >= 2) throw busyError()
        activeJobs += 1

        const owner = new AbortController()
        const onAbort = () => owner.abort()
        signal?.addEventListener('abort', onAbort, { once: true })
        const timer = setTimeout(onAbort, Math.max(0, expiresAtMs - Date.now()))
        const check = () => {
          if (owner.signal.aborted || Date.now() >= expiresAtMs) throw requestError()
          guard()
        }
        let cancel
        const cancelled = new Promise((_, reject) => {
          cancel = () => reject(requestError())
          owner.signal.addEventListener('abort', cancel, { once: true })
          if (owner.signal.aborted) cancel()
        })
        const work = (async () => {
          let object
          try {
            check()
            const buildPlot = await loadBuilder()
            check() // An expired lazy import must not launch a worker.
            object = await buildPlot(spec, { signal: owner.signal, expiresAtMs })
            check()
            return object
          } catch (error) {
            if (object) disposeMaterializedObject(object)
            throw classifyPlotError(error)
          }
        })()
        // Keep the physical admission slot until loading/rendering stops, not until
        // the request's early timeout response. Never leave a floating rejection.
        work.finally(() => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          owner.signal.removeEventListener('abort', cancel)
          activeJobs -= 1
        }).catch(() => {})
        return Promise.race([work, cancelled])
      }
    },
  }
}
