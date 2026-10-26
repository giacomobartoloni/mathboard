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

/** DOM belongs to the view adapter. Return viewport CSS coordinates, never scene coordinates. */
export function workspaceSafeArea(canvas, root) {
  const element = canvas.upperCanvasEl || canvas.lowerCanvasEl
  const view = element?.getBoundingClientRect()
  const width = canvas.getWidth(), height = canvas.getHeight()
  if (!view || !root) return { left: 0, top: 0, width, height }
  let left = 0, top = 0, bottom = height
  const visibleRect = (selector) => {
    const element = root.querySelector(selector)
    if (!element || !element.getClientRects().length) return null
    const r = element.getBoundingClientRect()
    if (!r.width || !r.height) return null
    return { left: r.left-view.left, right: r.right-view.left, top: r.top-view.top, bottom: r.bottom-view.top }
  }
  const chrome = visibleRect('.left-chrome')
  const horizontalChrome = chrome && chrome.right - chrome.left > chrome.bottom - chrome.top
  for (const selector of ['.left-chrome', '.left-chrome .shapes-submenu', '.left-chrome .color-popover']) {
    const rail = visibleRect(selector)
    if (!rail || rail.right <= 0 || rail.left >= width || rail.bottom <= 0 || rail.top >= height) continue
    if (horizontalChrome) top = Math.max(top, rail.bottom)
    else left = Math.max(left, rail.right)
  }
  for (const selector of ['.logo', '.board-library-trigger']) {
    const r = visibleRect(selector)
    if (r && r.bottom > 0 && r.top < height) top = Math.max(top, r.bottom)
  }
  for (const selector of ['.zoom-panel', '.support-panel', '.copyright', '.cookie-banner']) {
    const r = visibleRect(selector)
    if (!r || r.bottom <= 0 || r.top >= height) continue
    if (r.top >= height / 2) bottom = Math.min(bottom, r.top)
    else top = Math.max(top, r.bottom)
  }
  return { left, top, width: Math.max(0,width-left), height: Math.max(0,bottom-top) }
}
