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
    'MathBoardFormula',
  ]

  for (const name of names) {
    if (obj.isType?.(name)) return name
  }

  return obj.constructor?.name || null
}

function isComposite(obj) {
  if (typeof obj?.getObjects !== 'function') return false
  return Boolean(
    obj.isType?.('Group')
    || obj.isType?.('ActiveSelection')
    || obj.isType?.('MathBoardFormula')
    || obj.formulaType,
  )
}

function collectVectorPaints(obj, out = []) {
  if (!obj) return out
  if (typeof obj.getObjects === 'function') {
    for (const child of obj.getObjects()) {
      collectVectorPaints(child, out)
    }
    return out
  }

  const fill = obj.fill
  const stroke = obj.stroke
  if (fill && fill !== 'none' && fill !== 'transparent') out.push(String(fill))
  if (stroke && stroke !== 'none' && stroke !== 'transparent') out.push(String(stroke))
  return out
}

function snapshotForE2e(obj, { includeChildren = true } = {}) {
  const composite = isComposite(obj)
  // snapshotObject converts ActiveSelection-local left/top to canvas plane.
  const layout = snapshotObject(obj)
  const vectorPaints = obj.formulaType ? collectVectorPaints(obj) : []

  const snapshot = {
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
    mathboardId: typeof obj.mathboardId === 'string' ? obj.mathboardId : null,
    formulaType: typeof obj.formulaType === 'string'
      ? obj.formulaType
      : null,
    inkMode: obj.mathboardInkMode ?? null,
    renderedInkIsLight: obj.mathboardRenderedInkIsLight === undefined
      ? null
      : Boolean(obj.mathboardRenderedInkIsLight),
    filterTypes: Array.isArray(obj.filters)
      ? obj.filters.map((filter) => filter?.type).filter(Boolean)
      : [],
    childCount: composite ? obj.getObjects().length : null,
    padding: obj.padding != null ? Number(obj.padding) : null,
    scaleX: layout.scaleX != null ? Number(layout.scaleX) : null,
    scaleY: layout.scaleY != null ? Number(layout.scaleY) : null,
    angle: layout.angle != null ? Number(layout.angle) : null,
    vectorPaints,
    isVectorFormula: Boolean(
      obj.formulaType
      && composite
      && (obj.getObjects?.().length || 0) > 0
      && !obj.isType?.('Image')
      && !obj.isType?.('FabricImage'),
    ),
  }

  if (includeChildren && composite) {
    snapshot.children = obj.getObjects().map((child) => (
      snapshotForE2e(child, { includeChildren: false })
    ))
  }

  return snapshot
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

  const persistence = board._persistence?.status || null

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
    boardId: board._persistence?.boardId ?? null,
    persistence: persistence
      ? {
          state: persistence.state,
          lastSavedAt: persistence.lastSavedAt,
          error: persistence.error,
        }
      : null,
    objects: canvas.getObjects().map(snapshotForE2e),
  }
}

/**
 * @param {() => object | null | undefined} getBoard
 * @returns {() => void} uninstall
 */
function setFormulaTransform(getBoard, latex, patch) {
  const board = getBoard?.()
  const canvas = board?.canvas
  if (!canvas || !latex) return false

  const formula = canvas.getObjects().find((obj) => obj.latex === latex)
  if (!formula) return false

  formula.set(patch)
  formula.setCoords()
  canvas.requestRenderAll()
  return true
}

export function installBoardE2eHook(getBoard) {
  // Canary string must remain in dist-e2e for assert:e2e-hook (void alone is DCE'd).
  window.__MATHBOARD_E2E__ = Object.freeze({
    marker: E2E_MARKER,
    getState: () => getBoardState(getBoard()),
    setFormulaTransform: (latex, patch) => setFormulaTransform(getBoard, latex, patch),
    flushPersistence: () => getBoard()?.flushPersistence?.(),
    createObjects: (specs, options) => getBoard().getBoardController().createMany(specs, options),
    updateObject: (id, patch) => getBoard().getBoardController().update(id, patch),
    deleteObject: (id) => getBoard().getBoardController().delete(id),
    observeBoard: () => getBoard().getBoardController().observe(),
  })

  return () => {
    delete window.__MATHBOARD_E2E__
  }
}
