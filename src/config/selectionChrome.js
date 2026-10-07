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

import { normalizeBoardTheme } from './themes.js'

/**
 * Selection chrome is presentation. It is not document ink: none of these
 * fields are stroke, fill, or mathboardInkMode.
 */
const BOARD_CHROME = {
  light: {
    borderColor: '#1565c0',
    cornerColor: '#ffffff',
    cornerStrokeColor: '#1565c0',
    selectionColor: 'rgba(21, 101, 192, 0.16)',
    selectionBorderColor: '#1565c0',
  },
  dark: {
    borderColor: '#80deea',
    cornerColor: '#102027',
    cornerStrokeColor: '#80deea',
    selectionColor: 'rgba(128, 222, 234, 0.2)',
    selectionBorderColor: '#80deea',
  },
  chalkboard: {
    borderColor: '#ffe082',
    cornerColor: '#1b3a2f',
    cornerStrokeColor: '#ffe082',
    selectionColor: 'rgba(255, 224, 130, 0.22)',
    selectionBorderColor: '#ffe082',
  },
}

/**
 * Fabric control colors for one board theme, plus handle sizes.
 * cornerSize is the desktop handle. touchCornerSize is the touch hit area
 * and does not grow the painted handle.
 */
export function selectionChromeForBoard(boardTheme) {
  const theme = normalizeBoardTheme(boardTheme)
  return {
    ...BOARD_CHROME[theme],
    cornerSize: 14,
    touchCornerSize: 32,
    transparentCorners: false,
    cornerStyle: 'circle',
    borderScaleFactor: 2,
    padding: 4, // default for newly created generic Fabric objects
    selectionLineWidth: 2,
  }
}

const CANVAS_MARQUEE_KEYS = [
  'selectionColor',
  'selectionBorderColor',
  'selectionLineWidth',
]

/** Control colors for one object (excludes canvas marquee fields). */
export function selectionObjectChromeForBoard(boardTheme) {
  const objectChrome = { ...selectionChromeForBoard(boardTheme) }
  CANVAS_MARQUEE_KEYS.forEach((key) => {
    delete objectChrome[key]
  })
  return objectChrome
}

/**
 * Apply theme-dependent selection chrome to an object and nested Group members.
 * Preserve object-owned padding: Formula and technical Stamp wrappers may use
 * a larger interaction margin than the generic Fabric default.
 * Group children are not canvas top-level objects, so theme changes must walk in.
 */
export function applySelectionObjectChrome(object, objectChrome) {
  if (!object || typeof object.set !== 'function') return

  const themeChrome = { ...objectChrome }
  delete themeChrome.padding
  object.set(themeChrome)

  const isGroup = typeof object.isType === 'function' && object.isType('Group')
  if (!isGroup || typeof object.getObjects !== 'function') return
  object.getObjects().forEach((child) => applySelectionObjectChrome(child, objectChrome))
}
