import assert from 'node:assert/strict'
import test from 'node:test'

import { selectAnalyticsTransport } from '../src/analytics/selectTransport.js'
import { createDesktopAnalyticsTransport } from '../src/analytics/transports/desktop.js'
import { webAnalyticsTransport } from '../src/analytics/transports/web.js'

const transportConfig = {
  webTransport: webAnalyticsTransport,
  desktopTransport: { track() {} },
}

test('selects the web transport only for the production canonical host', () => {
  assert.equal(selectAnalyticsTransport({ ...transportConfig, production: true, hostname: 'mathboard.app', desktop: false }), webAnalyticsTransport)
  assert.equal(selectAnalyticsTransport({ ...transportConfig, production: true, hostname: 'preview.mathboard.app', desktop: false }), null)
  assert.equal(selectAnalyticsTransport({ ...transportConfig, production: false, hostname: 'mathboard.app', desktop: false }), null)
})

test('selects the desktop transport only in production, regardless of WebView hostname', () => {
  assert.equal(selectAnalyticsTransport({ ...transportConfig, production: true, hostname: 'tauri.localhost', desktop: true }), transportConfig.desktopTransport)
  assert.equal(selectAnalyticsTransport({ ...transportConfig, production: false, hostname: 'tauri.localhost', desktop: true }), null)
})

test('desktop transport forwards sanitized metadata plus runtime without a user identifier', async () => {
  const calls = []
  const transport = createDesktopAnalyticsTransport((command, args) => {
    calls.push({ command, args })
    return Promise.resolve()
  })

  transport.track('object_created', { object_type: 'shape' }, '1.8.0')
  assert.equal(calls.length, 0)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(calls, [{
    command: 'track_desktop_analytics_event',
    args: {
      event: 'object_created',
      metadata: { object_type: 'shape', runtime: 'desktop', app_version: '1.8.0' },
    },
  }])
})

test('desktop analytics transport swallows native invocation failures', async () => {
  const transport = createDesktopAnalyticsTransport(() => Promise.reject(new Error('offline')))
  transport.track('board_engaged', {}, '1.8.0')
  await new Promise((resolve) => setImmediate(resolve))
})

test('web transport queues events and loads one script on initialize', () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const scripts = []
  globalThis.window = {}
  globalThis.document = {
    getElementById(id) {
      return scripts.find((script) => script.id === id)
    },
    createElement() {
      return {}
    },
    head: {
      appendChild(script) {
        scripts.push(script)
      },
    },
  }

  try {
    webAnalyticsTransport.initialize('1.8.0')
    webAnalyticsTransport.initialize('1.8.0')
    webAnalyticsTransport.track('board_engaged', {})
    assert.equal(scripts.length, 1)
    assert.deepEqual(globalThis.window.sa_metadata, { runtime: 'web', app_version: '1.8.0' })
    assert.deepEqual(globalThis.window.sa_event.q, [['board_engaged', {}]])
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})
