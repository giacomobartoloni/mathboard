<!--
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
-->
<template>
  <div class="mcp-overlay" @click.self="close" @keydown.esc.stop.prevent="close" @keydown.tab="trapTab">
    <section ref="panel" class="mcp-panel" role="dialog" aria-modal="true" aria-labelledby="mcp-heading" tabindex="-1">
      <header class="mcp-header">
        <div>
          <span class="mcp-kicker">DESKTOP CONNECTIONS</span>
          <h2 id="mcp-heading">Local assistants</h2>
        </div>
        <button class="mcp-close" type="button" aria-label="Close local assistants" @click="close">×</button>
      </header>
      <p class="mcp-intro">Choose what local assistant clients may read from the current board. Connected assistants may send board content or images to their provider.</p>
      <p v-if="error" class="mcp-error" role="alert">{{ error }}</p>
      <p v-if="loading" role="status">Reading permissions…</p>
      <template v-else-if="status">
        <p class="mcp-board">Current board <code>{{ status.activeBoardId || 'Unavailable' }}</code></p>
        <div class="mcp-choice">
          <div><strong>Allow local connections</strong><small>Access starts off each time MathBoard opens.</small></div>
          <button type="button" :disabled="busy" :aria-pressed="status.enabled" @click="setEnabled(!status.enabled)">{{ status.enabled ? 'On' : 'Off' }}</button>
        </div>
        <div class="mcp-choice">
          <div><strong>Read board content</strong><small>Any eligible client running as this computer user can read this board while the grant lasts.</small></div>
          <button type="button" :disabled="busy || !status.enabled || !status.activeBoardId" :aria-pressed="readGranted" @click="grantRead">{{ readGranted ? 'Allowed' : 'Allow' }}</button>
        </div>
        <div class="mcp-choice">
          <div><strong>Read screenshots</strong><small>Separately allow images of the board, including areas outside the current view. Images can include private content.</small></div>
          <button type="button" :disabled="busy || !readGranted" :aria-pressed="status.screenshot" @click="grantScreenshot">{{ status.screenshot ? 'Allowed' : 'Allow' }}</button>
        </div>
        <div class="mcp-actions">
          <button type="button" :disabled="busy || (!readGranted && !status.screenshot)" @click="revoke">Revoke all access</button>
          <button type="button" :disabled="busy" @click="refresh">Refresh status</button>
        </div>
        <p class="mcp-note">Grants end when you switch boards or MathBoard closes. Client setup is not yet available in this build.</p>
      </template>
    </section>
  </div>
</template>

<script>
import { computed, nextTick, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export default {
  name: 'McpPermissionsModal',
  emits: ['close'],
  setup(_, { emit }) {
    const panel = ref(null)
    const loading = ref(true)
    const busy = ref(false)
    const status = ref(null)
    const error = ref(null)
    const readGranted = computed(() => Boolean(status.value?.enabled && status.value?.readBoardId
      && status.value.readBoardId === status.value.activeBoardId))
    const close = () => emit('close')
    const trapTab = (event) => {
      const controls = [...panel.value.querySelectorAll('button:not(:disabled)')]
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus()
      }
    }
    const refresh = async () => {
      busy.value = true
      error.value = null
      try { status.value = await invoke('mcp_permission_status') }
      catch { error.value = 'Could not read local assistant permissions.' }
      finally { busy.value = false; loading.value = false }
    }
    const action = async (command, args = {}) => {
      busy.value = true
      error.value = null
      try { status.value = await invoke(command, args) }
      catch {
        error.value = command === 'mcp_set_enabled'
          ? 'Local assistant connections are unavailable in this installation.'
          : 'The board or permission state changed. Refresh and try again.'
        try { status.value = await invoke('mcp_permission_status') } catch { /* Keep the last known status. */ }
      } finally { busy.value = false }
    }
    const expected = () => ({
      expectedBoardId: status.value.activeBoardId,
      expectedBoardEpoch: status.value.boardEpoch,
      expectedGrantEpoch: status.value.grantEpoch,
      expectedRendererGeneration: status.value.rendererGeneration,
    })
    const setEnabled = (enabled) => action('mcp_set_enabled', { enabled })
    const grantRead = () => { if (!readGranted.value) return action('mcp_grant_read', expected()) }
    const grantScreenshot = () => { if (!status.value.screenshot) return action('mcp_grant_screenshot', expected()) }
    const revoke = () => action('mcp_revoke_all')
    onMounted(async () => { await refresh(); await nextTick(); panel.value?.focus() })
    return { panel, loading, busy, status, error, readGranted, close, trapTab, refresh, setEnabled, grantRead, grantScreenshot, revoke }
  },
}
</script>

<style scoped>
.mcp-overlay { position: fixed; inset: 0; z-index: 1300; display: grid; place-items: center; padding: 20px; background: rgb(12 19 25 / 60%); }
.mcp-panel { box-sizing: border-box; width: min(580px, 100%); max-height: calc(100vh - 40px); overflow: auto; padding: 24px; border-radius: 14px; background: var(--surface-secondary); color: var(--text-primary); box-shadow: var(--panel-shadow); }
.mcp-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.mcp-header h2 { margin: 3px 0 0; font-size: 25px; }
.mcp-kicker { color: var(--text-muted); font-size: 11px; font-weight: 700; letter-spacing: .12em; }
.mcp-close { border: 0; background: transparent; color: var(--text-primary); font-size: 28px; cursor: pointer; }
.mcp-intro { line-height: 1.5; }
.mcp-board { padding: 10px 12px; border-radius: 8px; background: var(--surface-muted); }
.mcp-board code { overflow-wrap: anywhere; }
.mcp-choice { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 0; border-top: 1px solid var(--border-color); }
.mcp-choice strong, .mcp-choice small { display: block; }
.mcp-choice small { margin-top: 3px; color: var(--text-muted); line-height: 1.35; }
.mcp-choice button, .mcp-actions button { min-width: 82px; min-height: 36px; border: 1px solid var(--border-color); border-radius: 7px; background: var(--surface-muted); color: var(--text-primary); cursor: pointer; }
.mcp-choice button[aria-pressed="true"] { background: var(--selected-bg); }
button:disabled { opacity: .55; cursor: default; }
.mcp-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.mcp-note { margin-bottom: 0; color: var(--text-muted); font-size: 13px; line-height: 1.4; }
.mcp-error { color: #b83030; }
</style>
