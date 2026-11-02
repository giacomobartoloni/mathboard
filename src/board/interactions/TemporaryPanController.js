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

/**
 * Store exactly one tool for a Space hold. Explicit selections cancel the hold
 * without restoring it; key repeat and repeated releases are safe.
 */
export function createTemporaryPanController({ getTool, setTool }) {
  let previousTool = null

  return {
    press() {
      if (previousTool !== null) return false
      previousTool = getTool()
      setTool('pan')
      return true
    },
    release() {
      if (previousTool === null) return false
      const tool = previousTool
      previousTool = null
      setTool(tool)
      return true
    },
    cancel() {
      previousTool = null
    },
    isActive() {
      return previousTool !== null
    },
  }
}
