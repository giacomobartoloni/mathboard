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

export const TOOL_SHORTCUTS = {
  v: 'select',
  p: 'pencil',
  h: 'pan',
  t: 'font',
  f: 'formula',
  s: 'shapes',
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

export function isPlainToolKey(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) {
    return null
  }
  if (typeof event.key !== 'string' || event.key.length !== 1) return null
  return TOOL_SHORTCUTS[event.key.toLowerCase()] ?? null
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
