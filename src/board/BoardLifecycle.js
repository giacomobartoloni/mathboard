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

/** Fences asynchronous board work from document replacement and teardown. */
export class BoardLifecycle {
  constructor({ onReadyChanged = () => {} } = {}) {
    this._epoch = 0
    this._transitionToken = null
    this._disposed = false
    this._onReadyChanged = onReadyChanged
    this._listeners = new Set()
  }

  get epoch() {
    return this._epoch
  }

  isReady() {
    return !this._disposed && this._transitionToken === null
  }

  capture() {
    if (!this.isReady()) throw new Error('Board is transitioning or closed.')
    return Object.freeze({ epoch: this._epoch })
  }

  assertCurrent(lease) {
    return this.isReady() && lease?.epoch === this._epoch
  }

  assertTransition(token) {
    return !this._disposed && token !== null && token === this._transitionToken
  }

  subscribe(listener) {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  _notifyReadyChanged(ready) {
    try { this._onReadyChanged(ready) } catch (error) {
      console.error('Board interaction state could not be updated.', error)
    }
    for (const listener of this._listeners) {
      try { listener(ready, this._epoch) } catch (error) {
        console.error('Board lifecycle subscriber failed.', error)
      }
    }
  }

  async transition(operation) {
    if (!this.isReady()) throw new Error('Board is transitioning or closed.')
    this._epoch += 1
    const token = Object.freeze({ epoch: this._epoch })
    this._transitionToken = token
    this._notifyReadyChanged(false)
    try {
      return await operation(token)
    } finally {
      this._epoch += 1
      this._transitionToken = null
      if (!this._disposed) this._notifyReadyChanged(true)
    }
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true
    this._epoch += 1
    this._notifyReadyChanged(false)
  }
}
