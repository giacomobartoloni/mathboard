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

import { BoardPersistenceService } from '../../src/board/persistence/BoardPersistenceService.js'

/** Deterministic restore delay, installed before mount only by the E2E entry. */
export function installBootstrapGate() {
  let release
  let waiting = false
  if (sessionStorage.getItem('mathboard.e2e.pauseBootstrap') === 'true') {
    sessionStorage.removeItem('mathboard.e2e.pauseBootstrap')
    const gate = new Promise((resolve) => { release = resolve })
    const original = BoardPersistenceService.prototype.bootstrap
    BoardPersistenceService.prototype.bootstrap = async function (...args) {
      BoardPersistenceService.prototype.bootstrap = original
      waiting = true
      await gate
      waiting = false
      return original.apply(this, args)
    }
  }
  return { isWaiting: () => waiting, resume: () => release?.() }
}
