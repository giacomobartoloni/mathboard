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

import {
  getBoardCommandDescriptors, getBoardDiscoveryTypes,
  hasBoardCommandMethod, boardCommandMutatesBoard, executeBoardCommand,
} from '../src/board/agent/command-registry.js'

const descriptors = getBoardCommandDescriptors()
const { objectTypes, patchSchemas } = getBoardDiscoveryTypes()
const errors = [
  { status: 400, codes: ['invalid_command'], description: 'Invalid method or JSON.' },
  { status: 409, codes: ['board_not_ready', 'invalid_object_spec', 'invalid_object_patch', 'object_not_found',
    'nested_object_mutation_not_supported', 'formula_render_failed', 'board_commit_failed', 'local_agent_bridge_error'],
  description: 'Board/domain rejected; re-observe.' },
  { status: 503, codes: ['board_unavailable', 'board_disconnected'], description: 'Browser unavailable; reconnect.' },
  { status: 504, codes: ['command_timeout'], description: 'Timeout; observe before retry.' },
]
const libraryErrors = [
  { status: 400, codes: ['invalid_command'] },
  { status: 409, codes: ['board_not_found', 'board_archived', 'board_not_archived', 'confirmation_required', 'invalid_board_title', 'edit_in_progress'] },
  { status: 503, codes: ['board_unavailable', 'board_disconnected'] },
  { status: 504, codes: ['command_timeout'] },
]
const screenshotErrors = [
  { status: 409, codes: ['invalid_capture_request', 'object_not_found', 'board_not_ready', 'capture_too_large', 'capture_failed'] },
  { status: 403, codes: ['forbidden_origin'] },
  { status: 408, codes: ['request_timeout'] }, { status: 413, codes: ['request_too_large'] },
  { status: 429, codes: ['local_agent_busy'] },
  { status: 503, codes: ['board_unavailable', 'board_disconnected'] }, { status: 504, codes: ['command_timeout'] },
]

export const hasLocalAgentMethod = hasBoardCommandMethod
export const localAgentMethodMutatesBoard = boardCommandMutatesBoard

export function executeLocalAgentCommand(controller, command, capture, workspace) {
  if (!hasBoardCommandMethod(command?.method)) {
    throw new Error(`Unsupported local agent method: ${command?.method}`)
  }
  return executeBoardCommand(controller, command, capture, workspace)
}

/** Detached metadata only: this function never observes or accesses a board. */
export function getLocalAgentHelp() {
  return structuredClone({
    schemaVersion: 1,
    transport: 'local-agent-vite-bridge',
    commandEndpoint: { method: 'POST', path: '/__mathboard_agent/command' },
    healthEndpoint: { method: 'GET', path: '/__mathboard_agent/health' },
    schemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    methods: descriptors.map((metadata) => {
      const methodErrors = metadata.method.startsWith('boards.') ? libraryErrors
        : metadata.method === 'screenshot' ? screenshotErrors : errors
      return { ...metadata, requiresStable: metadata.requiresStable ?? metadata.mutatesBoard,
        errors: methodErrors, successStatus: 200 }
    }),
    objectTypes: [...objectTypes], patchSchemas,
    examplesByType: {
      rect: { type: 'rect', width: 80, height: 50, fill: null },
      circle: { type: 'circle', radius: 30 },
      ellipse: { type: 'ellipse', rx: 70, ry: 45, fill: null },
      polygon: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 90 }], fill: null },
      arrow: { type: 'arrow', x1: 200, y1: 240, x2: 500, y2: 240, headLength: 28, headWidth: 24, fill: null },
      line: { type: 'line', x1: 200, y1: 200, x2: 300, y2: 250 },
      path: { type: 'path', path: [['M', 200, 200], ['L', 300, 250]], fill: null },
      text: { type: 'text', text: 'Synthetic title' },
      formula: { type: 'formula', latex: 'x=2' },
      group: { type: 'group', objects: [{ type: 'rect', width: 40, height: 40 }] },
    },
    workflow: [
      'Connect one browser tab and check health; require observe.stable before mutation.',
      'Approve mutations explicitly; discovery grants no permissions.',
      'Use commandEndpoint and re-observe after changes or board switches.',
      'Decode read-only screenshot PNGs for visual inspection.',
      'On disconnect or timeout, re-observe before retrying a possibly committed command.',
    ],
    safety: { localDevelopmentOnly: true, loopbackHost: '127.0.0.1', requireStableBeforeMutation: true,
      discoveryGrantsAuthorization: false, containsBoardData: false },
    limitations: [
      'Only commands in methods are executable in this build; planned operations are absent.',
      'Only top-level IDs are mutable; nested edits reject. deleteMany and empty-board clear are no-ops on empty input; bulk removal is atomic.',
      'group requires two top-level IDs; Board Groups and nested IDs reject. Ungroup and history remain UI actions.',
      'measure is read-only; layout is atomic, scene-based, with a CSS-pixel margin.',
      'Scene coordinates ignore pan/zoom; create/createMany default omitted origins to left/top recursively. Stamps and UI creation are unchanged.',
      'Create IDs are regenerated, including group children. Group children use existing Fabric-local geometry; formulas remain atomic/editable.',
      'Update schemas vary by kind: bounded style for shapes/text, opacity for groups, paint/ink for formulas. Geometry patches reject.',
      'Path commands undergo runtime validation.',
      'Examples are synthetic; replace example IDs. Discovery does not authorize changes.',
      'Undo/Redo are UI actions, not bridge methods. Normal dev/production builds do not expose this bridge.',
      'Screenshot exports bounded canvas pixels only, not DOM overlays.',
    ],
  })
}
