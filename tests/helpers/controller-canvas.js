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

/** Focused canvas seam: Fabric objects and their geometry remain real. */
export function makeControllerCanvas(objects = []) {
  const items = [...objects]
  let active = null
  return {
    renderOnAddRemove: true,
    viewportTransform: [1, 0, 0, 1, 0, 0],
    getObjects: () => items.slice(),
    insertAt(index, ...added) { items.splice(index, 0, ...added) },
    remove(object) { const at = items.indexOf(object); if (at >= 0) items.splice(at, 1) },
    setActiveObject(object) { active = object },
    getActiveObject: () => active,
    getActiveObjects: () => active?.isType('ActiveSelection') ? active.getObjects() : (active ? [active] : []),
    discardActiveObject() {
      if (active?.isType('ActiveSelection')) active.removeAll()
      active = null
    },
    requestRenderAll() {},
    getZoom: () => 1,
    getWidth: () => 1200,
    getHeight: () => 800,
  }
}
