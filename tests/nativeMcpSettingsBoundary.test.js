/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('the shared board UI contains no native MCP settings configuration', () => {
  const app = source('src/App.vue')
  const bootstrap = source('src/app-bootstrap.js')
  for (const marker of ['McpPermissionsModal', 'Local assistants', 'showMcpPermissions', 'mcp-trigger',
    'mcp_permission_status', 'mcp_grant_read', 'mcp_revoke_all']) {
    assert.equal(app.includes(marker), false, 'App.vue must not contain ' + marker)
    assert.equal(bootstrap.includes(marker), false, 'bootstrap must not contain ' + marker)
  }
})

test('native MCP grants are restricted to the dedicated settings window', () => {
  const permissions = JSON.parse(source('src-tauri/capabilities/mcp-permissions.json'))
  const board = JSON.parse(source('src-tauri/capabilities/board-bridge.json'))
  const main = JSON.parse(source('src-tauri/capabilities/main.json'))
  assert.deepEqual(permissions.windows, ['mcp-settings'])
  assert.equal(permissions.webviews, undefined)
  assert.deepEqual(board.webviews, ['main'])
  assert.deepEqual(main.windows, ['main'])
  for (const command of ['set-enabled']) {
    const privilege = 'allow-mcp-' + command
    assert.ok(permissions.permissions.includes(privilege))
    assert.ok(!main.permissions.includes(privilege))
    assert.ok(!board.permissions.includes(privilege))
  }
})

test('Tauri routes permission commands to settings and generic cancellation to the board', () => {
  const native = source('src-tauri/src/board_bridge.rs')
  const settings = source('src-tauri/src/mcp_settings.rs')
  assert.equal((native.match(/crate::mcp_settings::WINDOW_LABEL/g) || []).length, 2)
  assert.equal((native.match(/app.emit_to\("main", "mathboard-board-cancel"/g) || []).length, 1)
  assert.ok(settings.includes('WebviewUrl::App("desktop/mcp-settings.html"'))
  assert.ok(settings.includes('get_webview_window(WINDOW_LABEL)'))
})

test('MCP permission UI is a Tauri-only independent Vite entry', () => {
  const vite = source('vite.config.js')
  const html = source('desktop/mcp-settings.html')
  const js = source('desktop/mcp-settings.js')
  assert.ok(vite.includes('tauriPlatform'))
  assert.ok(vite.includes("'mcp-settings': fileURLToPath("))
  assert.ok(html.includes('./mcp-settings.js'))
  assert.ok(html.includes('local assistants may access board content and screenshots'))
  assert.ok(js.includes("import { invoke } from '@tauri-apps/api/core'"))
  assert.ok(js.includes('getCurrentWindow().close()'))
  assert.equal(js.includes('mountMathBoard'), false)
  assert.equal(js.includes('createApp('), false)
  for (const method of ['mcp_permission_status', 'mcp_set_enabled']) assert.ok(js.includes(method))
  for (const removed of ['mcp_grant_read', 'mcp_grant_screenshot', 'mcp_revoke_all']) {
    assert.equal(js.includes(removed), false)
  }
})

test('the native board bridge is independent of MCP protocol names and transport details', () => {
  const bridge = source('src/platform/desktopBoardBridge.js')
  const native = source('src-tauri/src/board_bridge.rs')
  assert.ok(bridge.includes('cancellationEpoch'))
  assert.ok(bridge.includes('mathboard-board-cancel'))
  for (const marker of ['mcpRead', 'mcpGrantEpoch', 'activeMcpRequests',
    'minimumMcpEpoch', 'mathboard-mcp-cancel']) {
    assert.equal(bridge.includes(marker), false, 'Shared native bridge leaked ' + marker)
  }
  assert.ok(native.includes('pub cancellation_epoch: Option<u64>'))
  assert.equal(native.includes('pub mcp_read: bool'), false)
})

test('native MCP uses an accessible switch and URL-only local client setup', () => {
  const html = source('desktop/mcp-settings.html')
  const js = source('desktop/mcp-settings.js')
  const css = source('desktop/mcp-settings.css')
  const admission = source('src-tauri/src/mcp_http.rs')
  const bridge = source('src-tauri/src/board_bridge.rs')
  const cli = source('src-tauri/src/companion.rs')
  assert.match(html, /id="enable" type="checkbox" role="switch"/)
  assert.match(html, /aria-labelledby="enable-label"/)
  assert.match(html, /aria-describedby="enable-description enable-state"/)
  assert.match(js, /controls\.enable\.checked = pendingEnabled \?\? permission\.enabled/)
  assert.match(js, /addEventListener\('change'/)
  assert.match(css, /input:focus-visible \+ \.switch-track/)
  assert.equal(html.includes('id="authorization"'), false)
  assert.equal(bridge.includes('"authorization"'), false)
  assert.equal(admission.includes('AUTHORIZATION'), false)
  assert.equal(admission.includes('same_token'), false)
  assert.match(cli, /"endpoint": endpoint/)
  assert.match(admission, /fn bind_first_available\(start_port: u16\)/)
  assert.match(admission, /PREFERRED_PORT: u16 = 43179/)
  assert.match(admission, /\.with_allowed_hosts\(\[bound_host\.clone\(\)\]\)/)
  assert.match(admission, /pub fn endpoint\(&self\) -> Option<String>/)
  assert.match(bridge, /instance\.endpoint\(\)/)
  assert.match(cli, /write_http_startup_record\(output: &mut impl Write, endpoint: &str\)/)
  assert.equal(admission.includes('pub const ENDPOINT'), false)
  assert.match(cli, /record\.get\("token"\)\.is_none\(\)/)
})

test('native MCP settings copy the URL and refresh automatically without manual controls', () => {
  const html = source('desktop/mcp-settings.html')
  const js = source('desktop/mcp-settings.js')
  const css = source('desktop/mcp-settings.css')
  assert.equal(html.includes('id="refresh"'), false)
  assert.equal(html.includes('Refresh status'), false)
  assert.equal(js.includes("byId('refresh')"), false)
  assert.equal(js.includes('controls.refresh'), false)
  assert.match(js, /window\.addEventListener\('focus', \(\) => void refresh\(\)\)/)
  assert.match(html, /id="copy-endpoint" type="button"/)
  assert.match(html, /id="copy-status"[^>]*role="status"[^>]*aria-live="polite" hidden/)
  assert.match(html, /class="copy-action"/)
  assert.match(js, /const COPY_CONFIRMATION_MS = 2500/)
  assert.match(js, /window\.setTimeout\(/)
  assert.match(js, /window\.clearTimeout\(/)
  assert.match(js, /showCopyConfirmation\(\)/)
  assert.match(js, /dismissCopyConfirmation\(\)/)
  assert.match(js, /pendingEnabled === false\) dismissCopyConfirmation\(\)/)
  assert.match(css, /\.copy-popover\[hidden\] \{ display: none; \}/)
  assert.match(js, /navigator\.clipboard\?\.writeText/)
  assert.match(js, /document\.execCommand\('copy'\)/)
  assert.match(js, /permission\?\.enabled/)
  assert.match(css, /\.endpoint-row/)
})

test('native MCP surfaces and documents the selected port rather than a fixed endpoint', () => {
  const html = source('desktop/mcp-settings.html')
  const js = source('desktop/mcp-settings.js')
  const startup = source('src-tauri/src/lib.rs')
  const docs = source('docs/desktop/LOCAL-MCP.md')
  const adr = source('docs/adr/0011-native-local-mcp-lifecycle.md')
  assert.match(html, /preferred port is occupied/)
  assert.match(js, /permission\.endpoint/)
  assert.match(startup, /server\.endpoint\(\)/)
  assert.match(startup, /write_http_startup_record\(&mut output, &endpoint\)/)
  assert.match(docs, /assigned URL can change/)
  assert.match(adr, /actual.*bound port/)
})
