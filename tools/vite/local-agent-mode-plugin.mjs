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
import { CAPTURE_LIMITS } from '../../dev-agent/capture/contract.js'

const PREFIX = '/__mathboard_agent/'
const COMMAND_TIMEOUT_MS = 30000
const BODY_TIMEOUT_MS = 10000

function sendJson(response, status, payload) {
  if (response.writableEnded || response.destroyed) return
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

function transportError(code, message) {
  return { ok: false, error: { code, message } }
}

function isLocalRequest(request) {
  try {
    const protocol = request.socket.encrypted ? 'https:' : 'http:'
    const host = request.headers.host
    const url = new URL(`${protocol}//${host}`)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.host !== host || url.username || url.password) return false
    if (Number(url.port || (protocol === 'https:' ? 443 : 80)) !== request.socket.localPort) return false
    if (request.headers['sec-fetch-site'] === 'cross-site') return false
    const origin = request.headers.origin
    return origin === undefined || origin === url.origin
  } catch {
    return false
  }
}

function readJson(request, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    let size = 0
    let chunks = []
    const timer = setTimeout(() => fail(408, 'request_timeout', 'The local agent request body timed out.'), timeoutMs)
    function cleanup() {
      clearTimeout(timer)
      request.removeListener('data', onData)
      request.removeListener('end', onEnd)
      request.removeListener('error', onError)
      request.removeListener('aborted', onAborted)
    }
    function fail(status, code, message) {
      cleanup()
      chunks = []
      // Drain without retaining bytes so an uploading client can receive JSON.
      // A second bounded deadline also closes clients that never finish uploading.
      const drainTimer = setTimeout(() => request.destroy(), timeoutMs)
      drainTimer.unref()
      const clearDrain = () => clearTimeout(drainTimer)
      request.once('end', clearDrain)
      request.once('close', clearDrain)
      request.once('error', clearDrain)
      request.resume()
      reject(Object.assign(new Error(message), { status, code }))
    }
    function onData(chunk) {
      size += chunk.length
      if (size > maxBytes) return fail(413, 'request_too_large', 'The local agent request body exceeds its byte limit.')
      chunks.push(chunk)
    }
    function onEnd() {
      cleanup()
      try { resolve(JSON.parse(Buffer.concat(chunks, size).toString('utf8') || '{}')) }
      catch { reject(Object.assign(new Error('Malformed JSON body.'), { status: 400 })) }
      chunks = []
    }
    function onError() { fail(400, 'invalid_request', 'The local agent request body was interrupted.') }
    function onAborted() { onError() }
    const length = request.headers['content-length']
    if (length !== undefined && Number(length) > maxBytes) {
      fail(413, 'request_too_large', 'The local agent request body exceeds its byte limit.')
      return
    }
    request.on('data', onData)
    request.on('end', onEnd)
    request.on('error', onError)
    request.on('aborted', onAborted)
  })
}

function captureResultError(result) {
  if (typeof result?.data !== 'string' || result.mimeType !== 'image/png' || result.encoding !== 'base64') {
    return transportError('capture_failed', 'The browser returned an invalid PNG capture.')
  }
  const { widthPx, heightPx, data } = result
  if (data.length > CAPTURE_LIMITS.maxBase64Chars
    || widthPx > CAPTURE_LIMITS.maxDimension || heightPx > CAPTURE_LIMITS.maxDimension
    || widthPx * heightPx > CAPTURE_LIMITS.maxPixels) {
    return transportError('capture_too_large', 'The browser capture exceeds its output limits.')
  }
  if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx <= 0 || heightPx <= 0
    || !data.length || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    return transportError('capture_failed', 'The browser returned invalid capture dimensions or encoding.')
  }
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length > CAPTURE_LIMITS.maxPngBytes) {
    return transportError('capture_too_large', 'The browser capture exceeds the PNG byte limit.')
  }
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR'
    || bytes.readUInt32BE(16) !== widthPx || bytes.readUInt32BE(20) !== heightPx
    || bytes.toString('base64') !== data) {
    return transportError('capture_failed', 'The browser returned an invalid PNG capture.')
  }
  return null
}

export function localAgentModePlugin({ commandTimeoutMs = COMMAND_TIMEOUT_MS, bodyTimeoutMs = BODY_TIMEOUT_MS } = {}) {
  let browserResponse = null
  const pending = new Map()

  function settle(id, status, payload) {
    const command = pending.get(id)
    if (!command) return
    clearTimeout(command.timeout)
    pending.delete(id)
    sendJson(command.response, status, payload)
  }

  function failPending() {
    for (const id of pending.keys()) {
      settle(id, 503, transportError('board_disconnected', 'The local MathBoard browser disconnected.'))
    }
  }

  function rejectCaptureBody(request, error) {
    const id = request.headers['x-mathboard-command-id']
    // Missing or late correlation must never fail another caller's capture.
    // Unattributable uploads are rejected; pending commands retain their own deadline.
    if (typeof id !== 'string' || pending.get(id)?.method !== 'screenshot') return
    settle(id, 409, transportError(
      error.status === 413 ? 'capture_too_large' : 'capture_failed',
      error.status === 413 ? 'The browser capture exceeds the relay body limit.' : 'The browser capture result was interrupted or malformed.',
    ))
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
      server.httpServer?.once('close', failPending)
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]
        if (!path?.startsWith(PREFIX)) return next()
        response.once('error', () => response.destroy())
        if (!isLocalRequest(request)) {
          return sendJson(response, 403, transportError('forbidden_origin', 'Local agent requests require a loopback host and matching local origin.'))
        }

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
            command = await readJson(request, CAPTURE_LIMITS.maxCommandBodyBytes, bodyTimeoutMs)
          } catch (error) {
            return sendJson(response, error.status || 400, transportError(error.code || 'invalid_command', error.status === 400 ? 'Malformed JSON command.' : error.message))
          }
          if (!command || typeof command !== 'object' || Array.isArray(command)
            || typeof command.method !== 'string'
            || (command.params !== undefined && (typeof command.params !== 'object' || command.params === null || Array.isArray(command.params)))) {
            return sendJson(response, 400, transportError('invalid_command', 'A method and object params are required.'))
          }
          if (!browserResponse) {
            return sendJson(response, 503, transportError('board_unavailable', 'No local MathBoard browser is connected.'))
          }
          const captures = [...pending.values()].filter(entry => entry.method === 'screenshot').length
          if (pending.size >= CAPTURE_LIMITS.maxPendingCommands
            || (command.method === 'screenshot' && captures >= CAPTURE_LIMITS.maxConcurrentCaptures)) {
            return sendJson(response, 429, transportError('local_agent_busy', 'The local agent relay has reached its concurrent command limit.'))
          }
          const id = randomUUID()
          const timeout = setTimeout(() => {
            settle(id, 504, transportError('command_timeout', 'The local MathBoard command timed out.'))
          }, commandTimeoutMs)
          pending.set(id, { response, timeout, method: command.method })
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
            result = await readJson(request, CAPTURE_LIMITS.maxResultBodyBytes, bodyTimeoutMs)
          } catch (error) {
            rejectCaptureBody(request, error)
            return sendJson(response, error.status || 400, transportError(error.code || 'invalid_result', error.status === 400 ? 'Malformed JSON result.' : error.message))
          }
          if (!result || typeof result.id !== 'string' || typeof result.ok !== 'boolean') {
            rejectCaptureBody(request, { status: 400 })
            return sendJson(response, 400, transportError('invalid_result', 'A result id and ok flag are required.'))
          }
          const headerId = request.headers['x-mathboard-command-id']
          if (headerId !== undefined && headerId !== result.id) {
            rejectCaptureBody(request, { status: 400 })
            return sendJson(response, 400, transportError('invalid_result', 'The result id must match its command header.'))
          }
          const command = pending.get(result.id)
          if (!command) return sendJson(response, 404, transportError('unknown_result', 'No pending command has that id.'))
          if (result.ok) {
            const invalid = command.method === 'screenshot' ? captureResultError(result.result) : null
            settle(result.id, invalid ? 409 : 200, invalid || { ok: true, result: result.result })
          } else if (command.method === 'screenshot') {
            const messages = {
              invalid_capture_request: 'The board rejected the capture parameters.',
              object_not_found: 'A requested top-level board object was not found.',
              board_not_ready: 'The board is not ready for a stable capture.',
              capture_too_large: 'The requested capture exceeds its output limits.',
              capture_failed: 'The browser could not complete the capture.',
            }
            const code = typeof result.error?.code === 'string' && Object.hasOwn(messages, result.error.code) ? result.error.code : 'capture_failed'
            settle(result.id, 409, transportError(code, messages[code]))
          } else {
            settle(result.id, 409, {
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
