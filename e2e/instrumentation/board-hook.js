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

/**
 * Playwright-only board observability. Loaded only when Vite MODE=e2e via
 * a compile-time gated dynamic import from src/main.js. Must never ship in dist/.
 */

import { snapshotObject } from '../../src/history/commandLog.js'

const E2E_MARKER = 'MATHBOARD_E2E_INSTRUMENTATION_V1'

function objectType(obj) {
  if (!obj) return null

  const names = [
    'Path',
    'Rect',
    'Circle',
    'Line',
    'IText',
    'Text',
    'Textbox',
    'Group',
    'ActiveSelection',
    'FabricImage',
    'Image',
  ]

  for (const name of names) {
    if (obj.isType?.(name)) return name
  }

  return obj.constructor?.name || null
}

function snapshotForE2e(obj) {
  const isGroup = obj.isType?.('Group')
  // snapshotObject converts ActiveSelection-local left/top to canvas plane.
  const layout = snapshotObject(obj)

  return {
    type: objectType(obj),
    left: Number(layout.left) || 0,
    top: Number(layout.top) || 0,
    width: layout.width != null
      ? Number(layout.width)
      : (obj.width != null ? Number(obj.width) : null),
    height: layout.height != null
      ? Number(layout.height)
      : (obj.height != null ? Number(obj.height) : null),
    radius: layout.radius != null
      ? Number(layout.radius)
      : (obj.radius != null ? Number(obj.radius) : null),
    text: typeof obj.text === 'string' ? obj.text : null,
    latex: typeof obj.latex === 'string' ? obj.latex : null,
    formulaType: typeof obj.formulaType === 'string'
      ? obj.formulaType
      : null,
    inkMode: obj.mathboardInkMode ?? null,
    childCount: isGroup ? obj.getObjects().length : null,
  }
}

function getBoardState(board) {
  const canvas = board?.canvas

  if (!canvas) {
    return {
      zoom: 1,
      viewportTransform: [1, 0, 0, 1, 0, 0],
      history: {
        length: 0,
        step: -1,
        tipType: null,
      },
      active: {
        type: null,
        selectionCount: 0,
      },
      objects: [],
    }
  }

  const tip = board._history?.[board._historyStep]
  const active = canvas.getActiveObject()

  const selectionCount = active
    ? (
        active.isType?.('ActiveSelection')
          ? active.getObjects().length
          : 1
      )
    : 0

  return {
    zoom: Number(canvas.getZoom()),
    viewportTransform: [...canvas.viewportTransform],
    history: {
      length: board._history?.length ?? 0,
      step: board._historyStep ?? -1,
      tipType: tip?.type ?? null,
    },
    active: {
      type: objectType(active),
      selectionCount,
    },
    objects: canvas.getObjects().map(snapshotForE2e),
  }
}

/**
 * @param {() => object | null | undefined} getBoard
 * @returns {() => void} uninstall
 */
export function installBoardE2eHook(getBoard) {
  // Canary string must remain in dist-e2e for assert:e2e-hook (void alone is DCE'd).
  window.__MATHBOARD_E2E__ = Object.freeze({
    marker: E2E_MARKER,
    getState: () => getBoardState(getBoard()),
  })

  return () => {
    delete window.__MATHBOARD_E2E__
  }
}
