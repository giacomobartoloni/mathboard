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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import assert from 'node:assert/strict'
import test from 'node:test'
import { webAnalyticsTransport } from '../src/analytics/transports/web.js'

test('web initialization retains one script, global metadata, and the event queue', () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const scripts = []
  globalThis.window = {}
  globalThis.document = {
    getElementById: (id) => scripts.find((script) => script.id === id),
    createElement: () => ({}),
    head: { appendChild: (script) => scripts.push(script) },
  }

  try {
    webAnalyticsTransport.initialize('1.10.0')
    webAnalyticsTransport.initialize('1.10.0')
    webAnalyticsTransport.track('object_created', { object_type: 'formula' })
    assert.deepEqual(window.sa_metadata, { runtime: 'web', app_version: '1.10.0' })
    assert.deepEqual(scripts, [{
      id: 'simple-analytics-script',
      async: true,
      src: 'https://scripts.simpleanalyticscdn.com/latest.js',
    }])
    assert.deepEqual(window.sa_event.q, [['object_created', { object_type: 'formula' }]])
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})
