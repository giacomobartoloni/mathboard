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

import { ANALYTICS_EVENTS } from './events.js'

const MODES = new Set(['overlay', 'pinned'])
const CLOSE_REASONS = new Set(['close_button', 'escape', 'backdrop', 'board_action'])
const MODE_REASONS = new Set(['user', 'viewport'])
const BROWSE_ACTIONS = new Set(['search', 'recent', 'archived'])
const OUTCOMES = new Set(['success', 'failure'])
const BOARD_ACTIONS = Object.freeze({
  create: 'create',
  open: 'open',
  rename: 'rename',
  archive: 'archive',
  unarchive: 'unarchive',
  'unarchive-open': 'unarchive_open',
  delete: 'delete',
})

/**
 * Board Library UX events. No caller-supplied content, IDs, search terms,
 * error messages or arbitrary metadata may reach the analytics adapter.
 */
export function createBoardLibraryAnalytics(trackEvent) {
  const send = (event, metadata = {}) => {
    try { trackEvent(event, { library: 'boards', ...metadata }) } catch { /* Analytics is optional. */ }
  }

  return {
    opened() {
      send(ANALYTICS_EVENTS.LIBRARY_OPENED)
    },
    closed(mode, reason) {
      if (MODES.has(mode) && CLOSE_REASONS.has(reason)) {
        send(ANALYTICS_EVENTS.LIBRARY_CLOSED, { mode, reason })
      }
    },
    modeChanged(mode, reason) {
      if (MODES.has(mode) && MODE_REASONS.has(reason)) {
        send(ANALYTICS_EVENTS.LIBRARY_MODE_CHANGED, { mode, reason })
      }
    },
    browsed(action) {
      if (BROWSE_ACTIONS.has(action)) {
        send(ANALYTICS_EVENTS.LIBRARY_BROWSED, { action })
      }
    },
    actionFinished(action, outcome, mode) {
      const normalized = Object.hasOwn(BOARD_ACTIONS, action) ? BOARD_ACTIONS[action] : null
      if (normalized && OUTCOMES.has(outcome) && MODES.has(mode)) {
        send(ANALYTICS_EVENTS.LIBRARY_ACTION, { action: normalized, outcome, mode })
      }
    },
  }
}
