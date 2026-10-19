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

import { randomUUID } from 'node:crypto'

const PREFIX = '/__mathboard_agent/'
const COMMAND_TIMEOUT_MS = 30000

function sendJson(response, status, payload) {
  if (response.writableEnded) return
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

async function readJson(request) {
  let body = ''
  request.setEncoding('utf8')
  for await (const chunk of request) body += chunk
  return JSON.parse(body || '{}')
}

function transportError(code, message) {
  return { ok: false, error: { code, message } }
}

export function localAgentModePlugin() {
  let browserResponse = null
  const pending = new Map()

  function failPending() {
    for (const [id, command] of pending) {
      clearTimeout(command.timeout)
      sendJson(command.response, 503, transportError(
        'board_disconnected',
        'The local MathBoard browser disconnected.',
      ))
      pending.delete(id)
    }
  }

  return {
    name: 'mathboard-local-agent-mode',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('src="/src/main.js"', 'src="/dev-agent/main.js"')
      },
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]
        if (!path?.startsWith(PREFIX)) return next()

        if (request.method === 'GET' && path === `${PREFIX}health`) {
          return sendJson(response, 200, {
            ok: true,
            browserConnected: Boolean(browserResponse),
            pendingCommands: pending.size,
          })
        }

        if (request.method === 'GET' && path === `${PREFIX}events`) {
          if (browserResponse) {
            browserResponse.write('event: replaced\ndata: {}\n\n')
            browserResponse.end()
            failPending()
          }
          browserResponse = response
          response.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          response.write(': connected\n\n')
          response.on('close', () => {
            if (browserResponse !== response) return
            browserResponse = null
            failPending()
          })
          return
        }

        if (request.method === 'POST' && path === `${PREFIX}command`) {
          let command
          try {
            command = await readJson(request)
          } catch {
            return sendJson(response, 400, transportError('invalid_command', 'Malformed JSON command.'))
          }
          if (!command || typeof command !== 'object' || Array.isArray(command)
            || typeof command.method !== 'string'
            || (command.params !== undefined && (typeof command.params !== 'object' || command.params === null || Array.isArray(command.params)))) {
            return sendJson(response, 400, transportError('invalid_command', 'A method and object params are required.'))
          }
          if (!browserResponse) {
            return sendJson(response, 503, transportError('board_unavailable', 'No local MathBoard browser is connected.'))
          }

          const id = randomUUID()
          const timeout = setTimeout(() => {
            pending.delete(id)
            sendJson(response, 504, transportError('command_timeout', 'The local MathBoard command timed out.'))
          }, COMMAND_TIMEOUT_MS)
          pending.set(id, { response, timeout })
          response.on('close', () => {
            const entry = pending.get(id)
            if (entry?.response === response) {
              clearTimeout(entry.timeout)
              pending.delete(id)
            }
          })
          browserResponse.write(`event: command\ndata: ${JSON.stringify({ id, method: command.method, params: command.params || {} })}\n\n`)
          return
        }

        if (request.method === 'POST' && path === `${PREFIX}result`) {
          let result
          try {
            result = await readJson(request)
          } catch {
            return sendJson(response, 400, transportError('invalid_result', 'Malformed JSON result.'))
          }
          if (!result || typeof result.id !== 'string' || typeof result.ok !== 'boolean') {
            return sendJson(response, 400, transportError('invalid_result', 'A result id and ok flag are required.'))
          }
          const command = pending.get(result.id)
          if (!command) return sendJson(response, 404, transportError('unknown_result', 'No pending command has that id.'))
          clearTimeout(command.timeout)
          pending.delete(result.id)
          if (result.ok) {
            sendJson(command.response, 200, { ok: true, result: result.result })
          } else {
            sendJson(command.response, 409, {
              ok: false,
              error: {
                code: result.error?.code || 'local_agent_bridge_error',
                message: result.error?.message || 'The board rejected the command.',
              },
            })
          }
          return sendJson(response, 200, { ok: true })
        }

        return sendJson(response, 404, transportError('unknown_endpoint', 'Unknown local agent endpoint.'))
      })
    },
  }
}
