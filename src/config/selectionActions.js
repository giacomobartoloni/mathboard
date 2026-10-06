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
 * Which contextual actions a selection gets, and where the panel sits.
 * Fabric stays the authority for the active object. This module never sees
 * the canvas and never copies an object graph.
 * Classification is owned by BoardObjectPolicy (Formula before Group).
 */

import { BoardObjectPolicy } from '../board/BoardObjectPolicy.js'

export const ACTION_EDIT = 'edit'
export const ACTION_DUPLICATE = 'duplicate'
export const ACTION_DELETE = 'delete'
export const ACTION_GROUP = 'group'
export const ACTION_UNGROUP = 'ungroup'

export const DUPLICATE_OFFSET = 16
export const PANEL_GAP = 20
export const PANEL_MARGIN = 8
export const PANEL_BUTTON = 44
export const PANEL_PAD = 4
export const PANEL_ACTION_GAP = 4

export const EMPTY_SELECTION = {
  hasSelection: false,
  selectionCount: 0,
  selectionType: null,
  actions: [],
}

const boardObjectPolicy = new BoardObjectPolicy()

/**
 * Semantic kind. Multi-selection is one kind: no per-type action is added
 * when the selection mixes objects.
 */
export function selectionKind(object) {
  return boardObjectPolicy.kindOf(object)
}

export function selectionActions(kind) {
  if (!kind) return []
  if (kind === 'formula') return [ACTION_EDIT, ACTION_DUPLICATE, ACTION_DELETE]
  if (kind === 'activeSelection') return [ACTION_GROUP, ACTION_DUPLICATE, ACTION_DELETE]
  if (kind === 'group') return [ACTION_UNGROUP, ACTION_DUPLICATE, ACTION_DELETE]
  return [ACTION_DUPLICATE, ACTION_DELETE]
}

export function selectionMeta(object) {
  const selectionType = selectionKind(object)
  if (!selectionType) return { ...EMPTY_SELECTION, actions: [] }

  const members = selectionType === 'activeSelection' && typeof object.getObjects === 'function'
    ? object.getObjects()
    : null
  const selectionCount = members ? members.length : 1
  if (selectionCount < 1) return { ...EMPTY_SELECTION, actions: [] }

  return {
    hasSelection: true,
    selectionCount,
    selectionType,
    actions: selectionActions(selectionType),
  }
}

export function panelSize(actionCount) {
  const count = Math.max(0, actionCount | 0)
  if (count === 0) return { width: 0, height: 0 }
  return {
    width: PANEL_PAD * 2 + PANEL_BUTTON,
    height: PANEL_PAD * 2 + count * PANEL_BUTTON + (count - 1) * PANEL_ACTION_GAP,
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Scene-plane box to canvas CSS pixels. Fabric 7 getBoundingRect ignores
 * viewportTransform. Retina scaling is a context scale, so the viewport
 * matrix is already in CSS pixels.
 */
export function sceneBoxToViewport(box, viewportTransform) {
  if (!box || !viewportTransform || viewportTransform.length < 6) return null
  const [a, b, c, d, e, f] = viewportTransform
  const xs = []
  const ys = []
  for (const [x, y] of [
    [box.left, box.top],
    [box.left + box.width, box.top],
    [box.left, box.top + box.height],
    [box.left + box.width, box.top + box.height],
  ]) {
    xs.push(x * a + y * c + e)
    ys.push(x * b + y * d + f)
  }
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

/**
 * Place the panel to the right of the box, 20px above its top edge.
 * Fall back to the left when the right side does not fit, then clamp
 * inside the viewport. It does not drop below the selection.
 * `x` and `y` are the panel's top-left in the same
 * space as `frame` and `viewport`.
 */
export function selectionPanelPosition({
  frame,
  viewport,
  panel,
  gap = PANEL_GAP,
  margin = PANEL_MARGIN,
}) {
  if (!frame || !viewport || !panel || panel.width <= 0 || panel.height <= 0) return null

  const minX = viewport.left + margin
  const maxX = viewport.left + viewport.width - margin - panel.width
  const minY = viewport.top + margin
  const maxY = viewport.top + viewport.height - margin - panel.height
  const limitX = Math.max(minX, maxX)
  const limitY = Math.max(minY, maxY)

  const right = frame.left + frame.width + gap
  const left = frame.left - gap - panel.width
  const rightFits = right >= minX && right <= limitX
  const leftFits = left >= minX && left <= limitX

  let placement = 'right'
  let x = right
  if (!rightFits && leftFits) {
    placement = 'left'
    x = left
  } else if (!rightFits && !leftFits) {
    placement = 'right'
    x = clamp(right, minX, limitX)
  }

  const y = clamp(frame.top - 20, minY, limitY)

  return {
    x: Math.round(x),
    y: Math.round(y),
    placement,
  }
}
