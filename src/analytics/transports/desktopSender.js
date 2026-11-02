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

const MAX_IN_FLIGHT = 4
const MAX_QUEUED = 100

function browserDoNotTrack() {
  const signals = [globalThis.navigator?.doNotTrack, globalThis.window?.doNotTrack]
  return signals.includes('1') || signals.includes('yes')
}

/** Drop-on-failure, volatile delivery that never waits for analytics in the editor. */
export function createDesktopEventSender({
  send,
  isOnline = () => globalThis.navigator?.onLine !== false,
  doNotTrack = browserDoNotTrack,
}) {
  const queue = []
  let active = 0

  function blocked() {
    try { return !isOnline() || doNotTrack() } catch { return true }
  }

  function drain() {
    if (blocked()) {
      queue.length = 0
      return
    }
    while (active < MAX_IN_FLIGHT && queue.length > 0) {
      const [name, metadata] = queue.shift()
      active += 1
      void Promise.resolve()
        .then(() => {
          if (!blocked()) return send(name, metadata)
          queue.length = 0
        })
        .catch(() => { queue.length = 0 })
        .finally(() => {
          active -= 1
          drain()
        })
    }
  }

  return function sendEvent(name, metadata) {
    if (blocked()) {
      queue.length = 0
      return
    }
    if (queue.length >= MAX_QUEUED) return
    queue.push([name, metadata])
    drain()
  }
}
