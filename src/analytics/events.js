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
  FORMULA_EDITED: 'formula_edited',
  OBJECT_DELETED: 'object_deleted',
  UNDO_USED: 'undo_used',
  REDO_USED: 'redo_used',
  THEME_CHANGED: 'theme_changed',
  FULLSCREEN_ENTERED: 'fullscreen_entered',
  FULLSCREEN_EXITED: 'fullscreen_exited',
  SUPPORT_OPENED: 'support_opened',
  USAGE_MILESTONE: 'usage_milestone',
  // P1 — constants only; not wired yet
  FORMULA_RENDER_FAILED: 'formula_render_failed',
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

export const ANALYTICS_MILESTONES = Object.freeze([5, 20, 50])
