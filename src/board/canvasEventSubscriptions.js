/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/** Register only callbacks owned by the caller; return an idempotent disposer. */
export function subscribeCanvasEvents(canvas, entries) {
  const bound = [];
  try {
    for (const [event, listener] of entries) {
      canvas.on(event, listener);
      bound.push([event, listener]);
    }
  } catch (error) {
    for (const [event, listener] of bound.reverse()) canvas.off(event, listener);
    throw error;
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const [event, listener] of bound.reverse()) canvas.off(event, listener);
  };
}
