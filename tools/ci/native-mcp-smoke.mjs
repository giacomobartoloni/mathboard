/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

// This harness runs exclusively against a packaged application in a fresh,
// disposable user profile. It does not expose test hooks inside the WebView.
const executable = process.env.MATHBOARD_MCP_BINARY
const artifactDir = resolve(process.env.MATHBOARD_MCP_ARTIFACT_DIR || join(tmpdir(), 'mathboard-native-mcp-artifacts'))
const root = resolve(process.env.MATHBOARD_MCP_PROFILE_DIR || join(tmpdir(), 'mathboard-native-mcp-profile'))
const buildSha = process.env.MATHBOARD_SOURCE_SHA || process.env.GITHUB_SHA || 'unknown'
const maxWaitMs = 60000
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const tests = []
let app, session, endpoint, boardId
let stdout = '', stderr = ''

for (const directory of [artifactDir, root, join(root, 'home'), join(root, 'data'), join(root, 'config'), join(root, 'cache')]) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
}

const json = (name, data) => writeFileSync(join(artifactDir, name), `${JSON.stringify(data, null, 2)}\n`)
const sha256 = data => createHash('sha256').update(data).digest('hex')
const failureMessage = error => String(error?.message || error).replaceAll(root, '[test-profile]').slice(0, 1000)
const wait = async (promise, ms, label) => {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms} ms`)), ms) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function step(name, action) {
  const start = Date.now()
  try {
    const details = await action()
    tests.push({ name, status: 'PASS', durationMs: Date.now() - start, ...(details || {}) })
    process.stdout.write(`PASS ${name}\n`)
    return details
  } catch (error) {
    tests.push({ name, status: 'FAIL', durationMs: Date.now() - start, error: failureMessage(error) })
    process.stderr.write(`FAIL ${name}: ${failureMessage(error)}\n`)
    throw error
  } finally {
    json('results.json', { sourceSha: buildSha, platform: process.platform, arch: process.arch,
      executable: executable ? basename(executable) : null, tests })
  }
}

function appEnvironment() {
  return {
    ...process.env,
    HOME: join(root, 'home'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_CACHE_HOME: join(root, 'cache'),
    WEBKIT_DISABLE_DMABUF_RENDERER: '1',
    LIBGL_ALWAYS_SOFTWARE: '1',
  }
}

async function launch() {
  if (!executable || !existsSync(executable)) throw new Error('Installed desktop executable not found')
  const child = spawn(executable, ['--mathboard-mcp-http'], {
    env: appEnvironment(), cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  })
  app = child
  let pending = ''
  let settle
  const record = new Promise((resolveEndpoint, reject) => {
    settle = { resolve: resolveEndpoint, reject }
  })
  let found = false
  const onLine = line => {
    if (found) return
    try {
      const data = JSON.parse(line)
      if (data.transport !== 'streamable-http' || typeof data.endpoint !== 'string') return
      const url = new URL(data.endpoint)
      assert.equal(url.protocol, 'http:')
      assert.equal(url.hostname, '127.0.0.1')
      assert.equal(url.pathname, '/mcp')
      assert.equal(url.search, '')
      found = true
      settle.resolve(url.toString())
    } catch (error) {
      // Other stdout lines are diagnostic; malformed endpoint records fail on timeout.
      if (line.includes('"endpoint"')) settle.reject(error)
    }
  }
  child.stdout.on('data', chunk => {
    const text = chunk.toString('utf8')
    stdout = (stdout + text).slice(-100000)
    pending += text
    for (let i; (i = pending.indexOf('\n')) !== -1;) {
      onLine(pending.slice(0, i).trim())
      pending = pending.slice(i + 1)
    }
  })
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-100000) })
  child.once('error', error => { if (!found) settle.reject(error) })
  child.once('exit', (code, signal) => {
    if (!found) settle.reject(new Error(`Desktop exited before MCP startup: ${code ?? signal}`))
  })
  try {
    endpoint = await wait(record, maxWaitMs, 'Packaged desktop MCP startup')
    return endpoint
  } catch (error) {
    await terminate()
    throw error
  }
}

async function terminate() {
  const child = app
  app = null
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise(resolveExit => child.once('exit', resolveExit))
  child.kill('SIGTERM')
  try {
    await wait(exited, 5000, 'Desktop graceful shutdown')
  } catch {
    child.kill('SIGKILL')
    await wait(exited, 5000, 'Desktop forced shutdown').catch(() => {})
  }
}

async function connect() {
  assert(endpoint, 'MCP endpoint unavailable')
  const client = new Client({ name: 'mathboard-packaged-mcp-ci', version: '1.0.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(endpoint))
  await wait(client.connect(transport), 25000, 'MCP initialize')
  session = { client, transport }
  return client
}

async function closeSession() {
  const current = session
  session = null
  if (current) await wait(current.client.close(), 5000, 'MCP close').catch(() => {})
}

async function catalog() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await wait(session.client.listTools(), 10000, 'MCP tools/list')
    const names = response.tools?.map(tool => tool.name) || []
    if (['mathboard_help', 'mathboard_boards_create', 'mathboard_create', 'mathboard_update',
      'mathboard_observe', 'mathboard_screenshot'].every(name => names.includes(name))) return response.tools
    await sleep(1000)
  }
  throw new Error('Required MCP drawing and library tools never appeared in tools/list')
}

function unwrap(result, name) {
  if (result?.isError) {
    const text = result.content?.find(block => block.type === 'text')?.text || ''
    let code = 'unknown'
    try { code = JSON.parse(text).code || code } catch { /* Preserve a generic MCP failure. */ }
    throw new Error(`MCP tool ${name} failed: ${code}`)
  }
  if (result?.structuredContent) return result.structuredContent
  const text = result?.content?.find(block => block.type === 'text')?.text
  if (!text) throw new Error(`MCP tool ${name} returned no JSON result`)
  return JSON.parse(text)
}

async function call(name, args = {}) {
  assert(session?.client, 'MCP session is not initialized')
  const response = await wait(session.client.callTool({ name, arguments: args }), 25000, `MCP ${name}`)
  return unwrap(response, name)
}

async function observe(id) {
  return call('mathboard_observe', { boardId: id, detail: 'full' })
}

async function waitForBoard(id) {
  for (let i = 0; i < 30; i++) {
    const result = await observe(id)
    if (result.stable !== false) return result
    await sleep(500)
  }
  throw new Error('Board did not become stable')
}

async function screenshot(name) {
  const response = await wait(session.client.callTool({ name: 'mathboard_screenshot',
    arguments: { target: { kind: 'viewport' }, scale: 1 } }), 25000, 'Native screenshot')
  if (response.isError) return unwrap(response, 'mathboard_screenshot')
  const images = response.content?.filter(block => block.type === 'image') || []
  assert.equal(images.length, 1, 'MCP screenshot must return exactly one image content block')
  assert.equal(images[0].mimeType, 'image/png')
  const bytes = Buffer.from(images[0].data, 'base64')
  assert.ok(bytes.length > 32 && bytes.length <= 5 * 1024 * 1024)
  assert.deepEqual(bytes.subarray(0, 8), pngSignature)
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  assert.ok(width > 0 && height > 0 && width <= 2048 && height <= 2048)
  writeFileSync(join(artifactDir, `${name}.png`), bytes)
  return { hash: sha256(bytes), byteCount: bytes.length, width, height }
}

const plot = Object.freeze({
  type: 'plot', syntax: 'latex-v1', latex: 'x^2',
  mathWindow: { xMin: -6, xMax: 6, yMin: -4, yMax: 10 },
  frame: { width: 480, height: 320 }, axes: true, grid: true,
  axisNumbers: true, border: true, color: 'auto', left: 300, top: 200,
})

async function main() {
  try {
    await step('packaged-startup', async () => ({ endpoint: await launch() }))
    await step('native-mcp-discovery', async () => {
      await connect()
      const tools = await catalog()
      // Native help without a method lists names only. The detailed form
      // includes objectTypes, field schemas and examples.
      const help = await call('mathboard_help', { method: 'create' })
      assert.ok(help.objectTypes?.includes('plot'), 'Plot missing from detailed native help')
      const create = tools.find(tool => tool.name === 'mathboard_create')
      assert.ok(JSON.stringify(create.inputSchema).includes('latex-v1'))
      assert.ok(JSON.stringify(create.inputSchema).includes('mathWindow'))
      return { toolCount: tools.length, hasPlot: true }
    })
    await step('create-isolated-test-board', async () => {
      const board = await call('mathboard_boards_create', { title: `F039 Native MCP CI ${buildSha.slice(0, 8)}` })
      assert.match(board.id, /^mb_[A-Za-z0-9_-]+$/)
      boardId = board.id
      const observed = await waitForBoard(boardId)
      assert.equal(observed.objects.length, 0, 'Disposable board was not empty')
      return { boardId }
    })
    const empty = await step('native-empty-board-png', () => screenshot('empty-board'))
    const created = await step('native-plot-create-and-observe', async () => {
      const node = await call('mathboard_create', { boardId, spec: plot })
      assert.equal(node.type, 'plot')
      assert.equal(node.latex, plot.latex)
      assert.ok(typeof node.id === 'string' && node.id.length > 0)
      const view = await waitForBoard(boardId)
      assert.equal(view.objects.length, 1)
      assert.equal(view.objects[0].id, node.id)
      assert.deepEqual(view.objects[0].mathWindow, plot.mathWindow)
      return { id: node.id }
    })
    const first = await step('native-plot-screenshot-png', () => screenshot('plot-board'))
    assert.notEqual(first.hash, empty.hash, 'Plot screenshot matches the empty board PNG')
    await step('native-plot-update', async () => {
      const node = await call('mathboard_update', { boardId, id: created.id,
        patch: { latex: '1/x', color: '#2563eb', grid: false, border: false, axisNumbers: false } })
      assert.equal(node.id, created.id)
      const view = await waitForBoard(boardId)
      const current = view.objects[0]
      assert.equal(current.latex, '1/x')
      assert.equal(current.grid, false)
      assert.equal(current.color, '#2563eb')
    })
    const modified = await step('native-updated-plot-screenshot-png', () => screenshot('updated-plot-board'))
    assert.notEqual(modified.hash, first.hash, 'Updated Plot screenshot matches the original PNG')
    await step('native-plot-durable-restart', async () => {
      await closeSession()
      await terminate()
      endpoint = null
      await launch()
      await connect()
      await catalog()
      const view = await waitForBoard(boardId)
      assert.equal(view.objects.length, 1)
      assert.equal(view.objects[0].id, created.id)
      assert.equal(view.objects[0].latex, '1/x')
      assert.equal(view.objects[0].color, '#2563eb')
      assert.equal(view.objects[0].border, false)
      assert.equal(view.objects[0].axisNumbers, false)
    })
    await step('native-plot-post-restart-screenshot-png', async () => {
      await call('mathboard_boards_open', { boardId })
      await waitForBoard(boardId)
      return screenshot('reopened-plot-board')
    })
    await step('delete-disposable-test-board', async () => {
      const deleted = await call('mathboard_boards_delete', { boardId, confirm: true })
      assert.equal(deleted.deleted, true)
    })
  } finally {
    await closeSession()
    await terminate()
    writeFileSync(join(artifactDir, 'app-stdout.log'), stdout.replaceAll(root, '[test-profile]'))
    writeFileSync(join(artifactDir, 'app-stderr.log'), stderr.replaceAll(root, '[test-profile]'))
    json('results.json', { sourceSha: buildSha, platform: process.platform, arch: process.arch,
      executable: executable ? basename(executable) : null,
      packageSha256: process.env.MATHBOARD_MCP_PACKAGE_SHA256 || null,
      verdict: tests.every(test => test.status === 'PASS') && tests.at(-1)?.name === 'delete-disposable-test-board'
        ? 'PASS' : 'FAIL', tests })
  }
}

main().catch(error => {
  process.stderr.write(`Native MCP acceptance failed: ${failureMessage(error)}\n`)
  process.exitCode = 1
})
