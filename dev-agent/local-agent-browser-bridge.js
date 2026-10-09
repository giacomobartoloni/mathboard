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

const LOCAL_AGENT_MARKER = 'MATHBOARD_LOCAL_AGENT_BRIDGE_V1'

function executeCommand(controller, command) {
  switch (command.method) {
    case 'observe':
      return controller.observe()
    case 'create':
      return controller.create(command.params?.spec, command.params?.options)
    case 'createMany':
      return controller.createMany(command.params?.specs, command.params?.options)
    case 'update':
      return controller.update(command.params?.id, command.params?.patch, command.params?.options)
    case 'delete':
      return controller.delete(command.params?.id)
    default:
      throw new Error(`Unsupported local agent method: ${command.method}`)
  }
}

function errorPayload(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'local_agent_bridge_error',
    message: error?.message || String(error),
  }
}

export function installLocalAgentBrowserBridge(getBoard) {
  console.info(LOCAL_AGENT_MARKER)
  const events = new EventSource('/__mathboard_agent/events')
  let reportedPostFailure = false

  const onCommand = async (event) => {
    const command = JSON.parse(event.data)
    let payload

    try {
      const board = getBoard?.()
      if (!board) throw new Error('DrawBoard is not available.')
      const result = await executeCommand(board.getBoardController(), command)
      payload = { id: command.id, ok: true, result }
    } catch (error) {
      payload = { id: command.id, ok: false, error: errorPayload(error) }
    }

    try {
      const response = await fetch('/__mathboard_agent/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const onReplaced = () => events.close()
  events.addEventListener('command', onCommand)
  events.addEventListener('replaced', onReplaced)
  return () => {
    events.removeEventListener('command', onCommand)
    events.removeEventListener('replaced', onReplaced)
    events.close()
  }
}
