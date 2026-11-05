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

export const MIN_BOARD_ZOOM = 0.1
export const MAX_BOARD_ZOOM = 5

/** Normalize WheelEvent pixel, line and page deltas to a smooth zoom factor. */
export function wheelZoomLevel(currentZoom, deltaY, deltaMode = 0) {
  if (!Number.isFinite(currentZoom) || !Number.isFinite(deltaY) || currentZoom <= 0) {
    return currentZoom
  }
  const unitPixels = deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1
  const pixelDelta = Math.max(-1000, Math.min(1000, deltaY * unitPixels))
  const candidate = currentZoom * Math.exp(-pixelDelta / 500)
  return Math.max(MIN_BOARD_ZOOM, Math.min(MAX_BOARD_ZOOM, candidate))
}
