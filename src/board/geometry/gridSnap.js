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

// Grid snapping uses scene coordinates; the background grid alone is rendered.
export const MACRO_GRID_SIZE = 40;
export const DEFAULT_GRID_SUBDIVISIONS = 4;
export const SNAP_CAPTURE_PX = 2.5;
export const SNAP_RELEASE_PX = 3.75;
const MIN_PITCH_PX = 8;

/** Midpoint ties round away from zero, including negative scene coordinates. */
export function nearestGridCoordinate(value, step) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  const ratio = value / step;
  if (!Number.isFinite(ratio)) return value;
  const rounded = ratio < 0 ? -Math.round(-ratio) : Math.round(ratio);
  const result = rounded * step;
  return Number.isFinite(result) ? result : value;
}

/**
 * Keep magnetic capture zones distinct in CSS pixels when zooming out.
 * Falling back to the visible macrogrid never changes the document or pattern.
 */
export function effectiveGridStep({
  macroSize = MACRO_GRID_SIZE,
  subdivisions = DEFAULT_GRID_SUBDIVISIONS,
  zoom,
  releasePx = SNAP_RELEASE_PX,
} = {}) {
  if (!Number.isFinite(macroSize) || macroSize <= 0
    || !Number.isInteger(subdivisions) || subdivisions < 1
    || !Number.isFinite(zoom) || zoom <= 0
    || !Number.isFinite(releasePx) || releasePx <= 0) return null;
  const minPitch = Math.max(MIN_PITCH_PX, 2 * releasePx + 0.25);
  const fine = macroSize / subdivisions;
  if (fine * zoom >= minPitch) return fine;
  if (macroSize * zoom >= minPitch) return macroSize;
  return null;
}

function snapAxis(raw, step, zoom, latched, capturePx, releasePx) {
  if (Number.isFinite(latched) && Math.abs(latched - raw) * zoom <= releasePx) {
    return { delta: latched - raw, latch: latched };
  }
  const candidate = nearestGridCoordinate(raw, step);
  if (Number.isFinite(candidate) && Math.abs(candidate - raw) * zoom <= capturePx) {
    return { delta: candidate - raw, latch: candidate };
  }
  return { delta: 0, latch: null };
}

/** Returns an ephemeral translation and latch, never an object mutation. */
export function snapDragAnchor({
  x, y, step, zoom, latchX = null, latchY = null,
  capturePx = SNAP_CAPTURE_PX, releasePx = SNAP_RELEASE_PX, bypass = false,
} = {}) {
  const none = { dx: 0, dy: 0, latchX: null, latchY: null };
  if (bypass || !Number.isFinite(x) || !Number.isFinite(y)
    || !Number.isFinite(step) || step <= 0 || !Number.isFinite(zoom) || zoom <= 0
    || !Number.isFinite(capturePx) || capturePx < 0
    || !Number.isFinite(releasePx) || releasePx <= capturePx) return none;
  const horizontal = snapAxis(x, step, zoom, latchX, capturePx, releasePx);
  const vertical = snapAxis(y, step, zoom, latchY, capturePx, releasePx);
  return {
    dx: horizontal.delta,
    dy: vertical.delta,
    latchX: horizontal.latch,
    latchY: vertical.latch,
  };
}
