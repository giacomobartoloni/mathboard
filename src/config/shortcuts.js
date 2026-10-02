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
 * Classification for the single global keyboard path.
 * This module does not register listeners.
 */

import { COLOR_PRESETS } from './colors.js'

export const TOOL_SHORTCUTS = {
  v: 'select',
  p: 'pencil',
  h: 'pan',
  t: 'font',
  f: 'formula',
  s: 'shapes',
}

/** Plain keys that select a shape and activate the shapes tool. Line uses id `arrow`. */
export const SHAPE_SHORTCUTS = {
  r: 'rectangle',
  c: 'circle',
  l: 'arrow',
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function shouldIgnoreGlobalShortcut(event) {
  const target = event?.target
  if (!target || typeof target !== 'object') return false

  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : ''
  if (EDITABLE_TAGS.has(tag)) return true
  if (target.isContentEditable) return true
  if (typeof target.closest === 'function' && target.closest('[contenteditable="true"]')) {
    return true
  }
  return false
}

function hasCommandModifier(event) {
  return Boolean(event.ctrlKey || event.metaKey)
}

function isUnmodifiedPlainKey(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) {
    return false
  }
  return typeof event.key === 'string' && event.key.length === 1
}

export function isPlainToolKey(event) {
  if (!isUnmodifiedPlainKey(event)) return null
  return TOOL_SHORTCUTS[event.key.toLowerCase()] ?? null
}

export function isPlainShapeKey(event) {
  if (!isUnmodifiedPlainKey(event)) return null
  return SHAPE_SHORTCUTS[event.key.toLowerCase()] ?? null
}

/**
 * Digits 1–5 map to COLOR_PRESETS order. Returns the preset object, or null
 * when the event is not a color digit shortcut (main's value is itself null).
 */
export function isPlainColorDigit(event) {
  if (!isUnmodifiedPlainKey(event)) return null
  if (!/^[1-5]$/.test(event.key)) return null
  return COLOR_PRESETS[Number(event.key) - 1] ?? null
}

export function isUndoShortcut(event) {
  if (!event || !hasCommandModifier(event) || event.altKey || event.shiftKey) return false
  return event.key?.toLowerCase() === 'z'
}

export function isRedoShortcut(event) {
  if (!event || !hasCommandModifier(event) || event.altKey) return false
  const key = event.key?.toLowerCase()
  if (key === 'y' && !event.shiftKey) return true
  if (key === 'z' && event.shiftKey) return true
  return false
}

export function isDeleteShortcut(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey) return false
  return event.key === 'Delete' || event.key === 'Backspace'
}

export function isEscapeShortcut(event) {
  return event?.key === 'Escape'
}

/** Ctrl/Cmd+G — group the active multi-selection. */
export function isGroupShortcut(event) {
  if (!event || !hasCommandModifier(event) || event.altKey || event.shiftKey) return false
  return event.key?.toLowerCase() === 'g'
}

/** Ctrl/Cmd+Shift+G — ungroup the active permanent group. */
export function isUngroupShortcut(event) {
  if (!event || !hasCommandModifier(event) || event.altKey || !event.shiftKey) return false
  return event.key?.toLowerCase() === 'g'
}

/** Ctrl/Cmd+Shift+L — share the active selection as a stamp URL. */
export function isShareStampLinkShortcut(event) {
  if (!event || !hasCommandModifier(event) || event.altKey || !event.shiftKey) return false
  return event.key?.toLowerCase() === 'l'
}

/** Ctrl/Cmd+D — duplicate the active selection. */
export function isDuplicateShortcut(event) {
  if (!event || !hasCommandModifier(event) || event.altKey || event.shiftKey) return false
  return event.key?.toLowerCase() === 'd'
}

/** Ctrl/Cmd+A — select all top-level board objects. */
export function isSelectAllShortcut(event) {
  if (!event || !hasCommandModifier(event) || event.altKey || event.shiftKey) return false
  return event.key?.toLowerCase() === 'a'
}

/**
 * Ctrl/Cmd++ or Ctrl/Cmd+= — zoom in.
 * Shift is allowed because many layouts produce `+` via Shift+=.
 */
export function isZoomInShortcut(event) {
  if (!event || !hasCommandModifier(event) || event.altKey) return false
  const key = event.key
  return key === '+' || key === '='
}

/** Ctrl/Cmd+- — zoom out (Shift allowed for `_` on some layouts). */
export function isZoomOutShortcut(event) {
  if (!event || !hasCommandModifier(event) || event.altKey) return false
  const key = event.key
  return key === '-' || key === '_'
}

/** Ctrl/Cmd+0 — reset zoom to 100%. */
export function isZoomResetShortcut(event) {
  if (!event || !hasCommandModifier(event) || event.altKey || event.shiftKey) return false
  return event.key === '0'
}

/**
 * Human-readable shortcut map for the About panel.
 * Keep in sync with classifiers above and with shipped App.vue handlers only.
 */
export const SHORTCUT_HELP = [
  {
    group: 'Tools',
    items: [
      { id: 'select', label: 'Select', keys: 'V' },
      { id: 'pan', label: 'Pan', keys: 'H' },
      { id: 'pen', label: 'Pen', keys: 'P' },
      { id: 'text', label: 'Text', keys: 'T' },
      { id: 'formula', label: 'Formula', keys: 'F' },
      { id: 'shapes', label: 'Shapes', keys: 'S' },
      { id: 'rectangle', label: 'Rectangle', keys: 'R' },
      { id: 'circle', label: 'Circle', keys: 'C' },
      { id: 'line', label: 'Line', keys: 'L' },
    ],
  },
  {
    group: 'Edit',
    items: [
      { id: 'undo', label: 'Undo', keys: 'Ctrl/Cmd+Z' },
      { id: 'redo', label: 'Redo', keys: 'Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y' },
      { id: 'duplicate', label: 'Duplicate', keys: 'Ctrl/Cmd+D' },
      { id: 'selectAll', label: 'Select all', keys: 'Ctrl/Cmd+A' },
      { id: 'delete', label: 'Delete', keys: 'Delete / Backspace' },
      { id: 'group', label: 'Group', keys: 'Ctrl/Cmd+G' },
      { id: 'ungroup', label: 'Ungroup', keys: 'Ctrl/Cmd+Shift+G' },
      {
        id: 'share',
        label: 'Share link',
        keys: 'Ctrl/Cmd+Shift+L',
        hint: 'Select objects first. Opens a copyable board link.',
      },
    ],
  },
  {
    group: 'View',
    items: [
      { id: 'zoomIn', label: 'Zoom in', keys: 'Ctrl/Cmd++' },
      { id: 'zoomOut', label: 'Zoom out', keys: 'Ctrl/Cmd+-' },
      { id: 'zoomReset', label: 'Reset zoom', keys: 'Ctrl/Cmd+0' },
    ],
  },
  {
    group: 'Colors',
    items: [
      { id: 'colorMain', label: 'Main ink', keys: '1' },
      { id: 'colorRed', label: 'Red', keys: '2' },
      { id: 'colorYellow', label: 'Yellow', keys: '3' },
      { id: 'colorBlue', label: 'Blue', keys: '4' },
      { id: 'colorGreen', label: 'Green', keys: '5' },
    ],
  },
  {
    group: 'Other',
    items: [
      { id: 'escape', label: 'Cancel / close', keys: 'Esc' },
    ],
  },
]