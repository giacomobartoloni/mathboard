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
import { selectAnalyticsTransport } from '../src/analytics/selectTransport.js'

const webTransport = { kind: 'web' }
const desktopTransport = { kind: 'desktop' }
const configured = { webTransport, desktopTransport }

test('production website selects only the canonical web host', () => {
  assert.equal(selectAnalyticsTransport({ ...configured, production: true, desktop: false, hostname: 'mathboard.app' }), webTransport)
  assert.equal(selectAnalyticsTransport({ ...configured, production: true, desktop: false, hostname: 'preview.mathboard.app' }), null)
  assert.equal(selectAnalyticsTransport({ ...configured, production: true, desktop: false, hostname: 'localhost' }), null)
})

test('packaged desktop selects native transport regardless of WebView host', () => {
  assert.equal(selectAnalyticsTransport({ ...configured, production: true, desktop: true, hostname: 'tauri.localhost' }), desktopTransport)
})

test('development disables analytics for both browser and Tauri', () => {
  assert.equal(selectAnalyticsTransport({ ...configured, production: false, desktop: false, hostname: 'mathboard.app' }), null)
  assert.equal(selectAnalyticsTransport({ ...configured, production: false, desktop: true, hostname: 'tauri.localhost' }), null)
})
