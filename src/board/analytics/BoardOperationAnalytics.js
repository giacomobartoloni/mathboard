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

import { ANALYTICS_EVENTS, ANALYTICS_OBJECT_TYPES, ANALYTICS_SHAPES } from '../../analytics/events.js'
import { buildObjectDeletedMetadata } from '../../analytics/deletionMetadata.js'

const CHANNELS = new Set(['ui', 'local_agent', 'mcp'])
const OBJECT_TYPES = new Set([...Object.values(ANALYTICS_OBJECT_TYPES), 'stamp', 'stamp_template'])
const DELETION_TYPES = new Set([
  ANALYTICS_OBJECT_TYPES.PATH, ANALYTICS_OBJECT_TYPES.SHAPE, ANALYTICS_OBJECT_TYPES.TEXT,
  ANALYTICS_OBJECT_TYPES.FORMULA, ANALYTICS_OBJECT_TYPES.GROUP, ANALYTICS_OBJECT_TYPES.UNKNOWN,
])
const SHAPES = new Set(Object.values(ANALYTICS_SHAPES))
const COMMAND_TYPES = new Set(['add', 'batch-add', 'modify', 'replace', 'delete', 'duplicate', 'group', 'ungroup', 'recolor'])
const MAX_ROOTS = 10000

function safeCall(fn, ...args) {
  try { fn(...args) } catch { /* Telemetry never changes the editor outcome. */ }
}

function validRoots(effect) {
  return Array.isArray(effect.objectKinds)
    && effect.objectKinds.length > 0
    && effect.objectKinds.length <= MAX_ROOTS
}

function objectType(kinds) {
  const normalized = kinds.map((kind) => OBJECT_TYPES.has(kind) ? kind : ANALYTICS_OBJECT_TYPES.UNKNOWN)
  return normalized.every((kind) => kind === normalized[0]) ? normalized[0] : ANALYTICS_OBJECT_TYPES.MIXED
}

/** Translate closed, ephemeral board effects into the existing provider taxonomy. */
export function createBoardOperationAnalytics({ trackEvent, trackBoardEngaged, recordProductAction }) {
  function record(effect, { interactionChannel } = {}) {
    if (!effect || !CHANNELS.has(interactionChannel)) return false
    let eventName
    let metadata
    let humanAction = false

    switch (effect.kind) {
      case 'create': {
        if (!validRoots(effect)) return false
        const type = objectType(effect.objectKinds)
        metadata = { object_type: type }
        if (type === ANALYTICS_OBJECT_TYPES.SHAPE && SHAPES.has(effect.shape)) metadata.shape = effect.shape
        eventName = ANALYTICS_EVENTS.OBJECT_CREATED
        humanAction = true
        break
      }
      case 'delete': {
        if (!validRoots(effect)) return false
        const kinds = effect.objectKinds.map((kind) => DELETION_TYPES.has(kind) ? kind : ANALYTICS_OBJECT_TYPES.UNKNOWN)
        metadata = buildObjectDeletedMetadata(kinds, (kind) => kind)
        eventName = ANALYTICS_EVENTS.OBJECT_DELETED
        humanAction = true
        break
      }
      case 'formula_edit':
        eventName = ANALYTICS_EVENTS.FORMULA_EDITED
        humanAction = true
        break
      case 'group':
      case 'ungroup':
        humanAction = true
        break
      case 'text_edit':
        if (interactionChannel !== 'ui') return false
        eventName = ANALYTICS_EVENTS.TEXT_EDITED
        break
      case 'undo':
      case 'redo':
        if (interactionChannel !== 'ui' || !COMMAND_TYPES.has(effect.commandType)) return false
        eventName = effect.kind === 'undo' ? ANALYTICS_EVENTS.UNDO_USED : ANALYTICS_EVENTS.REDO_USED
        metadata = { command_type: effect.commandType }
        break
      case 'update':
      case 'layout':
        break
      default:
        return false
    }

    if (humanAction && interactionChannel === 'ui') {
      safeCall(trackBoardEngaged)
      safeCall(recordProductAction)
    }
    if (eventName) safeCall(trackEvent, eventName, metadata)
    return true
  }

  return { record }
}
