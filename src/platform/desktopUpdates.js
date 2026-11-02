/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { invoke } from '@tauri-apps/api/core'

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Discovery-only lifecycle. No updater plugin, package download, or installation. */
export function createDesktopUpdateDiscovery({
  fetchUpdate = () => invoke('check_desktop_update'),
  schedule = (callback, interval) => setInterval(callback, interval),
  unschedule = (id) => clearInterval(id),
} = {}) {
  let snapshot = { state: 'idle' }
  let pending = null
  let manualRequested = false
  let intervalId = null
  let disposed = false
  const listeners = new Set()

  const publish = (next) => {
    if (disposed) return
    snapshot = next
    for (const listener of listeners) listener(next)
  }

  const check = (background = false) => {
    if (disposed) return Promise.resolve()
    if (pending) {
      if (!background) {
        manualRequested = true
        publish({ state: 'checking' })
      }
      return pending
    }

    if (!background) publish({ state: 'checking' })
    pending = (async () => {
      try {
        const result = await fetchUpdate()
        if (disposed) return
        if (result?.latestVersion && result?.releaseUrl) {
          publish({
            state: 'available',
            installedVersion: result.installedVersion,
            latestVersion: result.latestVersion,
            releaseUrl: result.releaseUrl,
          })
        } else if (!background || manualRequested || snapshot.state === 'idle') {
          publish({ state: 'up-to-date', installedVersion: result?.installedVersion })
        } else if (snapshot.state === 'available' || snapshot.state === 'checking') {
          publish({ state: 'up-to-date', installedVersion: result?.installedVersion })
        }
      } catch {
        if (!background || manualRequested) {
          publish({ state: 'error', message: 'Could not check GitHub Releases. Try again later.' })
        }
      } finally {
        manualRequested = false
        pending = null
      }
    })()
    return pending
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot: () => snapshot,
    check: () => check(false),
    start() {
      if (disposed || intervalId !== null) return
      void check(true)
      intervalId = schedule(() => void check(true), UPDATE_CHECK_INTERVAL_MS)
    },
    dispose() {
      disposed = true
      if (intervalId !== null) unschedule(intervalId)
      intervalId = null
      listeners.clear()
    },
  }
}
