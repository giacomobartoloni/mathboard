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


/** Snap a scene-space vector to the nearest angular increment, keeping its length. */
export function snapPointToAngle(anchor, point, incrementDegrees = 15) {
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  const radius = Math.hypot(dx, dy)
  if (radius === 0) return { x: anchor.x, y: anchor.y }

  const incrementRadians = incrementDegrees * Math.PI / 180
  const angle = Math.round(Math.atan2(dy, dx) / incrementRadians) * incrementRadians
  return {
    x: anchor.x + radius * Math.cos(angle),
    y: anchor.y + radius * Math.sin(angle),
  }
}
