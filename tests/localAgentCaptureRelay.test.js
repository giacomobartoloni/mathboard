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

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { localAgentModePlugin } from '../tools/vite/local-agent-mode-plugin.mjs'

const PREFIX = '/__mathboard_agent/'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK7sAAAAASUVORK5CYII='
const capture = () => ({ mimeType: 'image/png', encoding: 'base64', data: PNG, widthPx: 1, heightPx: 1 })

async function relay(t, options = {}) {
  let middleware
  localAgentModePlugin(options).configureServer({ middlewares: { use(fn) { middleware = fn } } })
  const server = http.createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  t.after(() => { server.closeAllConnections(); server.close() })
  const headers = { host: `127.0.0.1:${port}` }
  function request(path, body, extraHeaders = {}, method = body === undefined ? 'GET' : 'POST') {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: PREFIX + path, method, headers: { ...headers, ...extraHeaders } }, res => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { text += chunk })
        res.on('end', () => {
          try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }) } catch (error) { reject(error) }
        })
      })
      // A relay may answer before a deliberately oversized upload has flushed.
      // Node can emit a late write error directly on that client socket.
      req.on('socket', socket => socket.on('error', () => {}))
      req.on('error', reject)
      req.end(body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body))
    })
  }
  async function browser() {
    const req = http.get({ hostname: '127.0.0.1', port, path: PREFIX + 'events', headers })
    const [res] = await once(req, 'response')
    let buffer = ''
    const queue = []
    const waiters = []
    res.setEncoding('utf8')
    res.on('data', chunk => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (event.startsWith('event: command\n')) {
          const command = JSON.parse(event.split('\ndata: ')[1])
          if (waiters.length) waiters.shift()(command)
          else queue.push(command)
        }
      }
    })
    return { close() { req.destroy() }, next() { return queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiters.push(resolve)) } }
  }
  return { request, browser, port, server }
}

function screenshot(r) { return r.request('command', { method: 'screenshot', params: { target: { kind: 'viewport' } } }) }
async function finish(r, command, result = capture()) { return r.request('result', { id: command.id, ok: true, result }, { 'X-MathBoard-Command-Id': command.id }) }

// Removing route-origin checks would allow a web page to read or mutate the board.
test('agent routes reject foreign hosts, origins and cross-site requests', async t => {
  const r = await relay(t)
  for (const path of ['health', 'events', 'command', 'result']) {
    for (const headers of [{ host: 'attacker.example' }, { origin: 'https://attacker.example' }, { 'sec-fetch-site': 'cross-site' }, { origin: `http://localhost:${r.port}` }]) {
      const response = await r.request(path, path === 'command' || path === 'result' ? {} : undefined, headers)
      assert.equal(response.status, 403)
      assert.equal(response.body.ok, false)
      assert.equal(response.headers['access-control-allow-origin'], undefined)
    }
  }
  for (const host of [`localhost:${r.port}`, `[::1]:${r.port}`]) {
    assert.equal((await r.request('health', undefined, { host, origin: `http://${host}` })).status, 200)
  }
})

test('keeps no-browser and malformed-envelope semantics', async t => {
  const r = await relay(t)
  assert.equal((await screenshot(r)).status, 503)
  assert.equal((await r.request('command', '{')).status, 400)
  assert.equal((await r.request('command', { method: 'screenshot', params: null })).status, 400)
})

test('bounded command bodies return JSON 413 for content-length and streamed input', async t => {
  const r = await relay(t)
  const body = JSON.stringify({ method: 'observe', params: { extra: 'x'.repeat(65536) } })
  for (const headers of [{ 'Content-Length': Buffer.byteLength(body) }, {}]) {
    const result = await r.request('command', body, headers)
    assert.equal(result.status, 413)
    assert.equal(result.body.error.code, 'request_too_large')
  }
})

test('domain errors pass through and normal PNG results remain compatible', async t => {
  const r = await relay(t)
  const browser = await r.browser()
  const first = screenshot(r)
  const command = await browser.next()
  assert.equal(command.method, 'screenshot')
  assert.deepEqual(command.params, { target: { kind: 'viewport' } })
  assert.equal((await finish(r, command)).status, 200)
  assert.deepEqual((await first).body, { ok: true, result: capture() })
  const second = r.request('command', { method: 'screenshot', params: { invalid: true } })
  const next = await browser.next()
  await r.request('result', { id: next.id, ok: false, error: { code: 'invalid_capture_request', message: 'Invalid target.' } })
  assert.equal((await second).status, 409)
  assert.equal((await second).body.error.code, 'invalid_capture_request')
})

test('invalid PNG/base64/dimensions are never forwarded as successful images', async t => {
  const r = await relay(t)
  const browser = await r.browser()
  const tooManyBytes = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')
  for (const change of [{ widthPx: 2049 }, { widthPx: 0 }, { widthPx: 1.2 }, { widthPx: 2048, heightPx: 2048 }, { widthPx: 2 }, { data: 'not PNG' }, { data: tooManyBytes }, { mimeType: 'text/plain' }, { encoding: 'hex' }]) {
    const response = screenshot(r)
    const command = await browser.next()
    await finish(r, command, { ...capture(), ...change })
    const actual = await response
    assert.equal(actual.status, 409)
    assert.ok(['capture_too_large', 'capture_failed'].includes(actual.body.error.code))
    assert.equal(actual.body.result, undefined)
  }
  assert.equal((await r.request('health')).body.pendingCommands, 0)
})

test('oversized result aborts its pending capture and keeps ordinary commands', async t => {
  const r = await relay(t)
  const browser = await r.browser()
  const ordinary = r.request('command', { method: 'observe' })
  const observe = await browser.next()
  const image = screenshot(r)
  const command = await browser.next()
  const oversized = await r.request('result', 'x'.repeat(7 * 1024 * 1024 + 1), { 'X-MathBoard-Command-Id': command.id })
  assert.equal(oversized.status, 413)
  assert.equal((await image).body.error.code, 'capture_too_large')
  await finish(r, observe, { objects: [] })
  assert.equal((await ordinary).status, 200)
  assert.equal((await r.request('health')).body.pendingCommands, 0)
})

test('oversized uncorrelated result leaves pending screenshots for completion or timeout', async t => {
  const r = await relay(t)
  const browser = await r.browser()
  const image = screenshot(r)
  const command = await browser.next()
  const response = await r.request('result', 'x'.repeat(7 * 1024 * 1024 + 1))
  assert.equal(response.status, 413)
  assert.equal((await r.request('health')).body.pendingCommands, 1)
  await finish(r, command)
  assert.equal((await image).status, 200)
})

test('limits simultaneous captures and total pending commands without orphaning', async t => {
  const r = await relay(t)
  const browser = await r.browser()
  const captures = []
  for (let i = 0; i < 2; i++) { const response = screenshot(r); captures.push([response, await browser.next()]) }
  assert.equal((await screenshot(r)).status, 429)
  for (let i = 0; i < 14; i++) { const response = r.request('command', { method: 'observe' }); captures.push([response, await browser.next()]) }
  assert.equal((await r.request('command', { method: 'observe' })).status, 429)
  for (const [response, command] of captures) { await finish(r, command, command.method === 'screenshot' ? capture() : {}); assert.equal((await response).status, 200) }
  assert.equal((await r.request('health')).body.pendingCommands, 0)
})

test('timeout and browser replacement release pending commands', { timeout: 2500 }, async t => {
  const r = await relay(t, { commandTimeoutMs: 60 })
  const browser = await r.browser()
  const image = screenshot(r)
  const command = await browser.next()
  assert.equal((await image).status, 504)
  assert.equal((await finish(r, command)).status, 404)
  assert.equal((await r.request('health')).body.pendingCommands, 0)
  const pending = screenshot(r)
  await browser.next()
  const replacement = await r.browser()
  assert.equal((await pending).body.error.code, 'board_disconnected')
  const next = screenshot(r)
  await finish(r, await replacement.next())
  assert.equal((await next).status, 200)
  replacement.close()
})


test('body deadline returns JSON and releases the correlated capture', { timeout: 2000 }, async t => {
  const r = await relay(t, { bodyTimeoutMs: 40 })
  const browser = await r.browser()
  const image = screenshot(r)
  const command = await browser.next()
  const partial = new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: r.port, path: PREFIX + 'result', method: 'POST', headers: { 'X-MathBoard-Command-Id': command.id } }, response => {
      let text = ''
      response.on('data', chunk => { text += chunk })
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }))
    })
    req.on('error', reject)
    req.write('{')
  })
  assert.equal((await partial).status, 408)
  assert.equal((await image).body.error.code, 'capture_failed')
  assert.equal((await r.request('health')).body.pendingCommands, 0)
})

test('browser disconnect and caller cancellation free pending slots', async t => {
  const r = await relay(t)
  let browser = await r.browser()
  const image = screenshot(r)
  await browser.next()
  browser.close()
  assert.equal((await image).status, 503)
  assert.equal((await r.request('health')).body.pendingCommands, 0)
  browser = await r.browser()
  const req = http.request({ hostname: '127.0.0.1', port: r.port, path: PREFIX + 'command', method: 'POST' })
  req.on('error', () => {})
  req.end(JSON.stringify({ method: 'screenshot' }))
  const command = await browser.next()
  req.destroy()
  await new Promise(resolve => req.once('close', resolve))
  // The result post reaches the server after cancellation and must not retain the old slot.
  const late = await finish(r, command)
  assert.equal(late.status, 404)
  assert.equal((await r.request('health')).body.pendingCommands, 0)
})

test('capture failure never reflects image bytes in an error', async t => {
  const r = await relay(t)
  const browser = await r.browser()
  const image = screenshot(r)
  const command = await browser.next()
  await r.request('result', { id: command.id, ok: false, error: { code: 'capture_failed', message: PNG } })
  const actual = await image
  assert.equal(actual.status, 409)
  assert.equal(actual.body.error.code, 'capture_failed')
  assert.equal(JSON.stringify(actual.body).includes(PNG), false)
})


test('malformed screenshot errors cannot throw during result validation', async t => {
  const r = await relay(t, { commandTimeoutMs: 60 })
  const browser = await r.browser()
  const image = screenshot(r)
  const command = await browser.next()
  const posted = r.request('result', { id: command.id, ok: false, error: { code: { toString: null } } })
  assert.equal((await image).status, 409)
  assert.equal((await posted).status, 200)
})


test('a late malformed result for capture A cannot fail newer pending capture B', async t => {
  const r = await relay(t)
  const browser = await r.browser()
  const first = screenshot(r)
  const old = await browser.next()
  await finish(r, old)
  assert.equal((await first).status, 200)
  const second = screenshot(r)
  const current = await browser.next()
  const late = await r.request('result', '{', { 'X-MathBoard-Command-Id': old.id })
  assert.equal(late.status, 400)
  assert.equal((await r.request('health')).body.pendingCommands, 1)
  await finish(r, current)
  assert.equal((await second).status, 200)
})
