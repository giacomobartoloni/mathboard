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

const SCRIPT_ID = 'simple-analytics-script'
const SCRIPT_SRC = 'https://scripts.simpleanalyticscdn.com/latest.js'

function ensureEventQueue() {
  if (typeof window.sa_event === 'function') return
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
  if (document.getElementById(SCRIPT_ID)) return
  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.async = true
  script.src = SCRIPT_SRC
  document.head.appendChild(script)
}

export const webAnalyticsTransport = {
  initialize(appVersion) {
    window.sa_metadata = { runtime: 'web', app_version: appVersion }
    ensureEventQueue()
    loadScript()
  },
  track(name, metadata) {
    ensureEventQueue()
    window.sa_event(name, metadata)
  },
}
