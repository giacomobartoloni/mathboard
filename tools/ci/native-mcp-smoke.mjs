/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
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

async function waitForWebViewBridge() {
  // The MCP listener can accept initialize/tools-list before the desktop
  // WebView has joined the native board broker. Probe only a read-only tool;
  // never retry boards.create after an unknown mutation outcome.
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      const response = await call('mathboard_boards_list')
      assert.ok(Array.isArray(response.boards), 'Unexpected board-library read envelope')
      return { boardCount: response.boards.length }
    } catch (error) {
      if (!/MCP tool mathboard_boards_list failed: (mcp_unavailable|board_not_ready|read_cancelled)/.test(error.message)) throw error
      await sleep(1000)
    }
  }
  throw new Error('Packaged WebView never connected to the native MCP board broker')
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

// Linux/Xvfb delivers real X11 keyboard and pointer events to the packaged GUI.
// No WebView injection, remote eval, board IPC or application test hooks are used.
function x11(...args) {
  try {
    return execFileSync('xdotool', args, { encoding: 'utf8', timeout: 5000 }).trim()
  } catch (error) {
    throw new Error('X11 command failed (' + args[0] + '): ' + failureMessage(error))
  }
}

async function pressGuiShortcut(combo) {
  assert.equal(process.platform, 'linux', 'X11 shortcut acceptance requires the Linux packaged smoke runner')
  const deadline = Date.now() + 10000
  let windowId
  while (!windowId && Date.now() < deadline) {
    try {
      const candidates = x11('search', '--onlyvisible', '--name', '^MathBoard$')
        .split(/\r?\n/).filter(Boolean)
      windowId = candidates.find(id => {
        try { return Number(x11('getwindowpid', id)) === app?.pid }
        catch { return false }
      })
    } catch { /* Wait for the installed GUI to map its X11 window. */ }
    if (!windowId) await sleep(250)
  }
  assert.ok(windowId, 'Installed MathBoard main X11 window was not found for GUI shortcut')
  const geometry = x11('getwindowgeometry', '--shell', windowId)
  const entries = [...geometry.matchAll(/^([A-Z]+)=(-?\d+)$/gm)]
  const values = Object.fromEntries(entries.map(([, key, value]) => [key, Number(value)]))
  assert.ok([values.X, values.Y, values.WIDTH, values.HEIGHT].every(Number.isFinite),
    'Could not determine installed GUI window geometry')
  // Xvfb has no window manager. Avoid --sync, which can block waiting for WM state.
  // The physical click is what focuses WebKit's canvas before actual key events.
  x11('windowfocus', windowId)
  await sleep(100)
  x11('mousemove', String(values.X + Math.floor(values.WIDTH * 0.6)),
    String(values.Y + Math.floor(values.HEIGHT * 0.75)))
  x11('click', '1')
  await sleep(150)
  x11('key', '--clearmodifiers', '--delay', '80', combo)
}

async function waitForGuiBoardState(label, matches) {
  const deadline = Date.now() + 12000
  let last = null
  while (Date.now() < deadline) {
    const view = await observe(boardId)
    last = { stable: view.stable, objects: view.objects?.map(({ id, type, latex }) => ({ id, type, latex })) }
    if (view.stable !== false && matches(view.objects || [])) return view
    await sleep(300)
  }
  throw new Error('GUI ' + label + ' did not change native MCP board readback: ' + JSON.stringify(last))
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
  axisNumbers: true, border: true, transparentBackground: true, color: 'auto', left: 300, top: 200,
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
      assert.ok(JSON.stringify(create.inputSchema).includes('transparentBackground'))
      return { toolCount: tools.length, hasPlot: true }
    })
    await step('native-mcp-webview-readiness', waitForWebViewBridge)
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
      assert.equal(view.objects[0].transparentBackground, true)
      return { id: node.id }
    })
    const first = await step('native-plot-screenshot-png', () => screenshot('plot-board'))
    assert.notEqual(first.hash, empty.hash, 'Plot screenshot matches the empty board PNG')
    await step('native-plot-update', async () => {
      const node = await call('mathboard_update', { boardId, id: created.id,
        patch: { latex: '1/x', color: '#2563eb', grid: false, border: false, axisNumbers: false, transparentBackground: false } })
      assert.equal(node.id, created.id)
      const view = await waitForBoard(boardId)
      const current = view.objects[0]
      assert.equal(current.latex, '1/x')
      assert.equal(current.grid, false)
      assert.equal(current.color, '#2563eb')
      assert.equal(current.transparentBackground, false)
    })
    const modified = await step('native-updated-plot-screenshot-png', () => screenshot('updated-plot-board'))
    assert.notEqual(modified.hash, first.hash, 'Updated Plot screenshot matches the original PNG')
    const originalPlot = objects => objects.length === 1
      && objects[0].id === created.id && objects[0].latex === plot.latex
      && objects[0].grid === true && objects[0].transparentBackground === true
    const editedPlot = objects => objects.length === 1
      && objects[0].id === created.id && objects[0].latex === '1/x'
      && objects[0].color === '#2563eb' && objects[0].grid === false
      && objects[0].transparentBackground === false
    await step('native-gui-undo-redo-plot-update', async () => {
      // Keyboard events go through WebKit -> App.vue -> BoardHistory; readback is MCP.
      await pressGuiShortcut('ctrl+z')
      await waitForGuiBoardState('undo Plot update', originalPlot)
      const undoPng = await screenshot('gui-undo-plot-edit')
      await pressGuiShortcut('ctrl+shift+z')
      await waitForGuiBoardState('redo Plot update', editedPlot)
      const redoPng = await screenshot('gui-redo-plot-edit')
      assert.notEqual(undoPng.hash, redoPng.hash, 'GUI Undo and Redo produced identical PNGs')
      return { objectId: created.id, undoPng: undoPng.hash, redoPng: redoPng.hash }
    })
    await step('native-gui-undo-redo-plot-create', async () => {
      await pressGuiShortcut('ctrl+z')
      await waitForGuiBoardState('undo update before undo create', originalPlot)
      await pressGuiShortcut('ctrl+z')
      await waitForGuiBoardState('undo Plot creation', objects => objects.length === 0)
      await pressGuiShortcut('ctrl+shift+z')
      await waitForGuiBoardState('redo Plot creation', originalPlot)
      await pressGuiShortcut('ctrl+shift+z')
      await waitForGuiBoardState('redo Plot update', editedPlot)
      // Let ordinary UI autosave complete before the packaged restart gate.
      await sleep(1500)
      return { objectId: created.id, originalIdPreserved: true }
    })
    await step('native-plot-durable-restart', async () => {
      await closeSession()
      await terminate()
      endpoint = null
      await launch()
      await connect()
      await catalog()
      // A new listener can advertise tools before its WebView is ready to serve board reads.
      await waitForWebViewBridge()
      const view = await waitForBoard(boardId)
      assert.equal(view.objects.length, 1)
      assert.equal(view.objects[0].id, created.id)
      assert.equal(view.objects[0].latex, '1/x')
      assert.equal(view.objects[0].color, '#2563eb')
      assert.equal(view.objects[0].border, false)
      assert.equal(view.objects[0].axisNumbers, false)
      assert.equal(view.objects[0].transparentBackground, false)
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
