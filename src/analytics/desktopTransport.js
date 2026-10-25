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

/**
 * In-memory only. Never persists or retries events after a transport failure.
 * A slow/offline analytics endpoint must not hold up drawing or grow memory.
 */
export function createDesktopEventSender(send, isOnline = () => navigator.onLine !== false) {
  const queue = []
  let active = 0

  function drain() {
    if (!isOnline()) {
      queue.length = 0
      return
    }
    while (active < MAX_IN_FLIGHT && queue.length > 0) {
      const [event, metadata] = queue.shift()
      active += 1
      Promise.resolve()
        .then(() => send(event, metadata))
        .catch(() => {
          // Drop buffered events rather than replaying stale data later.
          queue.length = 0
        })
        .finally(() => {
          active -= 1
          drain()
        })
    }
  }

  return function sendEvent(event, metadata) {
    if (!isOnline() || queue.length >= MAX_QUEUED) {
      return
    }
    queue.push([event, metadata])
    drain()
  }
}
