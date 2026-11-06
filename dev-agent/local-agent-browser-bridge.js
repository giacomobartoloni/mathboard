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

import { executeLocalAgentCommand, localAgentMethodMutatesBoard } from './command-contract.js'

const LOCAL_AGENT_MARKER = 'MATHBOARD_LOCAL_AGENT_BRIDGE_V1'

function errorPayload(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'local_agent_bridge_error',
    message: error?.message || String(error),
  }
}

export function installLocalAgentBrowserBridge(getBoard, capture) {
  console.info(LOCAL_AGENT_MARKER)
  const events = new EventSource('/__mathboard_agent/events')
  let reportedPostFailure = false

  let commandQueue = Promise.resolve()
  let replaced = false
  const active = new Map()
  const cancelled = new Set()
  const onCancel = (event) => {
    const { id } = JSON.parse(event.data)
    cancelled.add(id)
    if (cancelled.size > 256) cancelled.delete(cancelled.values().next().value)
    active.get(id)?.abort()
  }
  const dispatchCommand = async (event) => {
    const command = JSON.parse(event.data)
    if (replaced || cancelled.has(command.id)) return
    const owner = new AbortController()
    active.set(command.id, owner)
    let payload

    try {
      const board = getBoard?.()
      if (!board) throw new Error('DrawBoard is not available.')
      const guard = () => {
        if (replaced || cancelled.has(command.id) || owner.signal.aborted
          || Date.now() >= command.expiresAtMs || getBoard?.() !== board) {
          throw Object.assign(new Error('The local agent request timed out.'), { code: 'command_timeout' })
        }
      }
      guard()
      const finish = localAgentMethodMutatesBoard(command.method) ? capture.beginMutation() : () => {}
      let result
      try {
        const controller = board.getBoardController({
          signal: owner.signal, expiresAtMs: command.expiresAtMs, guard,
        })
        result = await executeLocalAgentCommand(controller, command, capture, board.getBoardWorkspace())
      } finally { finish() }
      guard()
      payload = { id: command.id, ok: true, result }
    } catch (error) {
      payload = { id: command.id, ok: false, error: errorPayload(error) }
    } finally {
      active.delete(command.id)
    }
    if (replaced || cancelled.has(command.id)) return

    try {
      const response = await fetch('/__mathboard_agent/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MathBoard-Command-Id': command.id },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      if (!reportedPostFailure) {
        console.error('Local agent result could not be delivered:', error)
        reportedPostFailure = true
      }
    }
  }

  // SSE callbacks are asynchronous; process them in order so a board transition
  // cannot overtake a create/update request already received by the browser.
  const onCommand = (event) => {
    commandQueue = commandQueue.then(() => dispatchCommand(event)).catch(error => {
      console.error('Local agent command dispatch failed:', error)
    })
  }

  const onReplaced = () => {
    replaced = true
    for (const owner of active.values()) owner.abort()
    events.close()
  }
  events.addEventListener('command', onCommand)
  events.addEventListener('cancel', onCancel)
  events.addEventListener('replaced', onReplaced)
  return () => {
    onReplaced()
    events.removeEventListener('command', onCommand)
    events.removeEventListener('cancel', onCancel)
    events.removeEventListener('replaced', onReplaced)
  }
}
