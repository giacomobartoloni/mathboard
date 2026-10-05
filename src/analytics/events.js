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

/** Implemented product events (snake_case). */
export const ANALYTICS_EVENTS = Object.freeze({
  BOARD_ENGAGED: 'board_engaged',
  OBJECT_CREATED: 'object_created',

  TEXT_TOOL_SELECTED: 'text_tool_selected',
  TEXT_CREATION_STARTED: 'text_creation_started',
  TEXT_CREATION_CANCELLED: 'text_creation_cancelled',
  TEXT_EDIT_STARTED: 'text_edit_started',
  TEXT_EDITED: 'text_edited',

  FORMULA_TOOL_SELECTED: 'formula_tool_selected',
  FORMULA_MODAL_OPENED: 'formula_modal_opened',
  FORMULA_ASSIST_USED: 'formula_assist_used',
  FORMULA_SUBMITTED: 'formula_submitted',
  FORMULA_EDITED: 'formula_edited',
  FORMULA_MODAL_CANCELLED: 'formula_modal_cancelled',
  FORMULA_RENDER_FAILED: 'formula_render_failed',

  OBJECT_DELETED: 'object_deleted',
  UNDO_USED: 'undo_used',
  REDO_USED: 'redo_used',
  THEME_CHANGED: 'theme_changed',
  FULLSCREEN_ENTERED: 'fullscreen_entered',
  FULLSCREEN_EXITED: 'fullscreen_exited',
  SUPPORT_OPENED: 'support_opened',
  USAGE_MILESTONE: 'usage_milestone',

  // P1 — constants only; not wired yet
  EXTERNAL_LINK_OPENED: 'external_link_opened',
  DOCUMENT_SAVED: 'document_saved',
  DOCUMENT_OPENED: 'document_opened',
  DOCUMENT_EXPORTED: 'document_exported',
})

export const ANALYTICS_OBJECT_TYPES = Object.freeze({
  PATH: 'path',
  SHAPE: 'shape',
  TEXT: 'text',
  FORMULA: 'formula',
})

export const ANALYTICS_SHAPES = Object.freeze({
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  ARROW: 'arrow',
})

export const ANALYTICS_FORMULA_MODES = Object.freeze({
  CREATE: 'create',
  EDIT: 'edit',
})

export const ANALYTICS_FORMULA_CLOSE_REASONS = Object.freeze({
  CANCEL_BUTTON: 'cancel_button',
  CLOSE_BUTTON: 'close_button',
  BACKDROP: 'backdrop',
  ESCAPE: 'escape',
})

export const ANALYTICS_FORMULA_ASSIST_SOURCES = Object.freeze({
  QUICK_INSERT: 'quick_insert',
  PALETTE: 'palette',
})

export const ANALYTICS_FORMULA_PALETTE_GROUPS = Object.freeze({
  SYMBOLS: 'symbols',
  GREEK: 'greek',
  RELATIONS: 'relations',
})

export const ANALYTICS_MILESTONES = Object.freeze([5, 20, 50])
