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

import packageInfo from '../../package.json'
import { ANALYTICS_EVENTS, ANALYTICS_MILESTONES } from './events.js'

const PRODUCTION_HOSTS = new Set(['mathboard.app'])
const SCRIPT_ID = 'simple-analytics-script'
const SCRIPT_SRC = 'https://scripts.simpleanalyticscdn.com/latest.js'
const APP_VERSION = packageInfo.version

let initialized = false
let boardEngaged = false
let productActionCount = 0
const firedMilestones = new Set()

export function isAnalyticsEnabled() {
  return (
    import.meta.env.PROD &&
    typeof window !== 'undefined' &&
    PRODUCTION_HOSTS.has(window.location.hostname)
  )
}

function ensureEventQueue() {
  if (typeof window.sa_event === 'function') {
    return
  }
  window.sa_event = function saEventPlaceholder() {
    const args = Array.prototype.slice.call(arguments)
    if (window.sa_event.q) {
      window.sa_event.q.push(args)
    } else {
      window.sa_event.q = [args]
    }
  }
}

function loadScript() {
  if (document.getElementById(SCRIPT_ID)) {
    return
  }
  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.async = true
  script.src = SCRIPT_SRC
  document.head.appendChild(script)
}

/**
 * Idempotent. Never throws. Loads Simple Analytics only when enabled.
 */
export function initializeAnalytics() {
  try {
    if (initialized) {
      return
    }
    initialized = true

    if (!isAnalyticsEnabled()) {
      return
    }

    window.sa_metadata = {
      runtime: 'web',
      app_version: APP_VERSION,
    }

    ensureEventQueue()
    loadScript()
  } catch {
    // Analytics must never break the app.
  }
}

function isFlatPrimitive(value) {
  if (typeof value === 'string' || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  return false
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }
  const normalized = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (isFlatPrimitive(value)) {
      normalized[key] = value
    }
  }
  return normalized
}

/**
 * Fire a custom event. No-op when analytics is disabled.
 * Metadata must be flat primitives only.
 */
export function trackEvent(name, metadata = {}) {
  if (!isAnalyticsEnabled()) {
    return
  }
  try {
    ensureEventQueue()
    window.sa_event(name, normalizeMetadata(metadata))
  } catch {
    // Analytics must never break the app.
  }
}

/** Once per page load (in-memory). */
export function trackBoardEngaged() {
  if (boardEngaged) {
    return
  }
  boardEngaged = true
  trackEvent(ANALYTICS_EVENTS.BOARD_ENGAGED)
}

/**
 * Count a product action; fire usage_milestone at 5 / 20 / 50.
 */
export function recordProductAction() {
  productActionCount += 1
  const count = productActionCount
  if (
    ANALYTICS_MILESTONES.includes(count) &&
    !firedMilestones.has(count)
  ) {
    firedMilestones.add(count)
    trackEvent(ANALYTICS_EVENTS.USAGE_MILESTONE, { actions: count })
  }
}
