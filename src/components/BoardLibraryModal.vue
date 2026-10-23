<!--
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
-->
<template>
  <div class="board-library-overlay" @click.self="$emit('close')" @keydown.esc.stop.prevent="$emit('close')"
    @keydown.tab="trapTab">
    <section ref="dialogPanel" class="board-library-panel" role="dialog" aria-modal="true"
      aria-labelledby="board-library-heading" :aria-busy="busy" tabindex="-1">
      <header class="board-library-header">
        <span class="board-library-heading-icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'chalkboard']" />
        </span>
        <div class="board-library-heading-copy">
          <h2 id="board-library-heading">Board library</h2>
          <p>Boards save after edits in this browser. Local storage is not a backup.</p>
        </div>
        <button ref="closeButton" class="board-library-icon-button" type="button" :disabled="busy"
          aria-label="Close board library" @click="$emit('close')">
          <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
        </button>
      </header>

      <form class="board-library-create" @submit.prevent="createBoard">
        <label for="new-board-title">Create a board</label>
        <div class="board-library-create-fields">
          <input id="new-board-title" v-model="newTitle" maxlength="120" autocomplete="off"
            placeholder="Name (optional)" :disabled="busy || loading">
          <button class="board-library-primary-button" type="submit" :disabled="busy || loading">
            <font-awesome-icon :icon="['fas', 'plus']" aria-hidden="true" />
            New board
          </button>
        </div>
      </form>

      <div class="board-library-tabs" role="group" aria-label="Board views">
        <button type="button" :class="{ active: !showArchived }" :aria-pressed="!showArchived"
          :disabled="busy || loading" @click="selectView(false)">Recent ({{ boards.length }})</button>
        <button type="button" :class="{ active: showArchived }" :aria-pressed="showArchived"
          :disabled="busy || loading" @click="selectView(true)">Archived ({{ archivedBoards.length }})</button>
      </div>

      <div class="board-library-content" :class="showArchived ? 'board-library-trash' : 'board-library-recent'"
        :aria-busy="loading">
        <div v-if="loading" class="board-library-loading" role="status" aria-label="Loading boards">
          <div v-for="index in 3" :key="index" class="board-library-loading-row" aria-hidden="true">
            <span></span><span></span>
          </div>
        </div>
        <ul v-else-if="visibleBoards.length" class="board-library-list">
          <li v-for="board in visibleBoards" :key="board.id" :class="{ 'is-active': board.isActive }">
            <div class="board-library-row">
              <span class="board-library-glyph" aria-hidden="true">
                <font-awesome-icon :icon="['fas', 'chalkboard']" />
              </span>
              <div class="board-library-details">
                <span v-if="board.isActive" class="board-library-current-name" :title="board.title">{{ board.title }}</span>
                <button v-else-if="!showArchived" type="button" class="board-library-open" :title="board.title"
                  :disabled="busy" @click="$emit('action', { action: 'open', boardId: board.id })">{{ board.title }}</button>
                <span v-else class="board-library-current-name" :title="board.title">{{ board.title }}</span>
                <span class="board-library-meta">
                  <span v-if="board.isActive" class="board-library-kind">Current board</span>
                  <span v-if="board.isActive && board.updatedAt" aria-hidden="true"> · </span>
                  <time v-if="board.updatedAt" :datetime="board.updatedAt">{{ formatBoardDate(board.updatedAt) }}</time>
                  <span v-else-if="!board.isActive">Saved locally</span>
                </span>
              </div>
              <button v-if="showArchived" class="board-library-restore" type="button" :disabled="busy"
                :aria-label="'Unarchive ' + board.title" @click="submitAction('unarchive', board.id)">
                <font-awesome-icon :icon="['fas', 'undo']" aria-hidden="true" />
                <span>Unarchive</span>
              </button>
              <button :id="'actions-' + board.id" class="board-library-icon-button board-library-more" type="button"
                :aria-label="'Actions for ' + board.title" :aria-expanded="actionMenuId === board.id"
                :disabled="busy" @click="toggleActions(board.id)">
                <font-awesome-icon :icon="['fas', 'ellipsis']" aria-hidden="true" />
              </button>
            </div>

            <form v-if="renameId === board.id" class="board-library-rename" @submit.prevent="submitRename(board.id)"
              @keydown.esc.stop.prevent="cancelInline(board.id)">
              <label :for="'rename-' + board.id">Rename board</label>
              <div>
                <input :id="'rename-' + board.id" v-model="renameTitle" maxlength="120" :disabled="busy">
                <button type="submit" :disabled="busy || !renameTitle.trim()">Save name</button>
                <button type="button" :disabled="busy" @click="cancelInline(board.id)">Cancel</button>
              </div>
            </form>

            <div v-if="actionMenuId === board.id" class="board-library-actions" role="group"
              :aria-label="'Actions for ' + board.title" @keydown.esc.stop.prevent="cancelInline(board.id)">
              <button v-if="!showArchived" type="button" :disabled="busy" @click="beginRename(board)">
                <font-awesome-icon :icon="['fas', 'pen-to-square']" aria-hidden="true" /> Rename
              </button>
              <button v-if="!showArchived" type="button" :disabled="busy" @click="submitAction('archive', board.id)">
                <font-awesome-icon :icon="['fas', 'box-archive']" aria-hidden="true" /> Archive
              </button>
              <button class="board-library-danger" type="button" :disabled="busy" @click="beginDelete(board)">
                <font-awesome-icon :icon="['fas', 'trash']" aria-hidden="true" /> Delete
              </button>
            </div>

            <div v-if="confirmDeleteId === board.id" class="board-library-delete-confirm" role="group"
              :aria-label="'Confirm deletion of ' + board.title" @keydown.esc.stop.prevent="cancelInline(board.id)">
              <span>Permanently delete “{{ board.title }}” from this device? This cannot be undone.</span>
              <button :id="'confirm-delete-' + board.id" class="board-library-danger" type="button"
                :disabled="busy" @click="submitDelete(board.id)">
                Permanently delete
              </button>
              <button type="button" :disabled="busy" @click="cancelInline(board.id)">Cancel</button>
            </div>
          </li>
        </ul>
        <div v-else class="board-library-empty" role="status">
          <font-awesome-icon :icon="['fas', showArchived ? 'box-archive' : 'chalkboard']" aria-hidden="true" />
          <strong>{{ showArchived ? 'No archived boards' : 'No saved boards yet' }}</strong>
          <p>{{ showArchived ? 'Boards you archive will appear here.' : 'Your current board will appear after its first edit.' }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

export default {
  name: 'BoardLibraryModal',
  props: {
    boards: { type: Array, default: () => [] },
    archivedBoards: { type: Array, default: () => [] },
    busy: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
  },
  emits: ['close', 'action'],
  setup(props, { emit }) {
    const newTitle = ref('')
    const renameId = ref(null)
    const renameTitle = ref('')
    const confirmDeleteId = ref(null)
    const actionMenuId = ref(null)
    const showArchived = ref(false)
    const closeButton = ref(null)
    const dialogPanel = ref(null)
    const pendingFocus = ref(null)
    const visibleBoards = computed(() => showArchived.value ? props.archivedBoards : props.boards)
    const dateFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

    onMounted(() => closeButton.value?.focus())
    watch(() => props.busy, async (busy) => {
      if (busy || !pendingFocus.value) return
      await nextTick()
      const target = pendingFocus.value === 'close'
        ? closeButton.value
        : document.getElementById('actions-' + pendingFocus.value)
      const focusTarget = target || closeButton.value
      focusTarget?.focus()
      pendingFocus.value = null
    })

    const awaitActionFocus = (target) => {
      pendingFocus.value = target
      dialogPanel.value?.focus()
    }
    const trapTab = (event) => {
      const controls = [...dialogPanel.value.querySelectorAll('button:not(:disabled), input:not(:disabled)')]
        .filter(element => element.getClientRects().length)
      if (!controls.length) {
        event.preventDefault()
        dialogPanel.value.focus()
        return
      }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogPanel.value)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogPanel.value)) {
        event.preventDefault()
        first.focus()
      }
    }

    const formatBoardDate = (value) => {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? 'Saved locally' : dateFormatter.format(date)
    }
    const selectView = (archived) => {
      showArchived.value = archived
      actionMenuId.value = null
      renameId.value = null
      confirmDeleteId.value = null
    }
    const createBoard = () => {
      emit('action', { action: 'create', title: newTitle.value.trim() || undefined })
      newTitle.value = ''
    }
    const toggleActions = (boardId) => {
      actionMenuId.value = actionMenuId.value === boardId ? null : boardId
      renameId.value = null
      confirmDeleteId.value = null
    }
    const submitAction = (action, boardId) => {
      actionMenuId.value = null
      awaitActionFocus('close')
      emit('action', { action, boardId })
    }
    const beginRename = async (board) => {
      actionMenuId.value = null
      renameId.value = board.id
      renameTitle.value = board.title
      await nextTick()
      document.getElementById('rename-' + board.id)?.focus()
    }
    const beginDelete = async (board) => {
      actionMenuId.value = null
      confirmDeleteId.value = board.id
      await nextTick()
      document.getElementById('confirm-delete-' + board.id)?.focus()
    }
    const cancelInline = async (boardId) => {
      actionMenuId.value = null
      renameId.value = null
      confirmDeleteId.value = null
      await nextTick()
      document.getElementById('actions-' + boardId)?.focus()
    }
    const submitDelete = (boardId) => {
      confirmDeleteId.value = null
      awaitActionFocus('close')
      emit('action', { action: 'delete', boardId })
    }
    const submitRename = (boardId) => {
      if (!renameTitle.value.trim()) return
      awaitActionFocus(boardId)
      emit('action', { action: 'rename', boardId, title: renameTitle.value.trim() })
      renameId.value = null
    }
    return { newTitle, renameId, renameTitle, confirmDeleteId, actionMenuId, showArchived, closeButton, dialogPanel,
      visibleBoards, formatBoardDate, selectView, createBoard, toggleActions, submitAction,
      submitRename, beginRename, beginDelete, cancelInline, submitDelete, trapTab }
  },
}
</script>

<style scoped>
.board-library-overlay {
  position: fixed;
  inset: 0;
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, .46);
}
.board-library-panel {
  box-sizing: border-box;
  width: min(640px, 100%);
  max-height: min(82vh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  box-shadow: 0 18px 50px rgba(0, 0, 0, .22);
  text-align: left;
}
.board-library-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 24px 16px;
}
.board-library-heading-icon, .board-library-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: 8px;
  background: var(--surface-tertiary);
  color: var(--text-primary);
}
.board-library-heading-icon { width: 44px; height: 44px; font-size: 20px; }
.board-library-heading-copy { flex: 1; min-width: 0; }
.board-library-heading-copy h2 { margin: 0; font-size: 21px; line-height: 1.3; }
.board-library-heading-copy p { max-width: 55ch; margin: 5px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.45; }
.board-library-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--icon-color);
  cursor: pointer;
}
.board-library-icon-button:hover:enabled { background: var(--hover-bg); }
.board-library-create { padding: 0 24px 18px; }
.board-library-create label, .board-library-rename label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}
.board-library-create-fields, .board-library-rename > div { display: flex; gap: 8px; }
.board-library-panel input {
  box-sizing: border-box;
  min-width: 0;
  min-height: 44px;
  flex: 1;
  padding: 9px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
}
.board-library-panel input::placeholder { color: var(--text-placeholder); }
.board-library-panel button { font: inherit; }
.board-library-create-fields button, .board-library-rename button, .board-library-actions button,
.board-library-delete-confirm button {
  min-height: 40px;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: var(--surface-tertiary);
  color: var(--text-primary);
  cursor: pointer;
}
.board-library-create-fields button:hover:enabled, .board-library-rename button:hover:enabled,
.board-library-actions button:hover:enabled, .board-library-delete-confirm button:hover:enabled {
  box-shadow: inset 0 0 0 1px var(--border-color);
}
.board-library-create-fields .board-library-primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 8px 16px;
  background: var(--selected-bg);
  color: var(--selected-text);
  font-weight: 600;
  white-space: nowrap;
}
.board-library-tabs {
  display: flex;
  gap: 18px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border-color);
}
.board-library-tabs button {
  min-height: 44px;
  padding: 0 2px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.board-library-tabs button.active { border-bottom-color: var(--selected-bg); color: var(--text-primary); font-weight: 600; }
.board-library-content {
  min-height: 160px;
  overflow-y: auto;
  padding: 4px 24px 24px;
  scrollbar-color: var(--border-color) transparent;
}
.board-library-loading-row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 74px;
  border-bottom: 1px solid var(--border-color);
}
.board-library-loading-row span:first-child { width: 42px; height: 42px; border-radius: 8px; background: var(--surface-tertiary); }
.board-library-loading-row span:last-child { width: 45%; height: 12px; border-radius: 6px; background: var(--surface-tertiary); }
.board-library-list { list-style: none; padding: 0; margin: 0; }
.board-library-list li { padding: 6px 0; border-bottom: 1px solid var(--border-color); }
.board-library-list li:last-child { border-bottom: 0; }
.board-library-row { display: flex; align-items: center; gap: 12px; min-height: 62px; }
.board-library-glyph { width: 42px; height: 42px; font-size: 17px; }
.is-active .board-library-glyph { background: var(--selected-bg); color: var(--selected-text); }
.board-library-details { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.board-library-current-name, .board-library-open {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  text-align: left;
}
.board-library-open {
  width: fit-content;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}
.board-library-open:hover:enabled { text-decoration: underline; text-underline-offset: 3px; }
.board-library-meta { color: var(--text-secondary); font-size: 12px; }
.board-library-kind { color: var(--text-primary); font-weight: 600; }
.board-library-restore {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  min-height: 40px;
  padding: 8px 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}
.board-library-restore:hover:enabled { background: var(--hover-bg); }
.board-library-actions, .board-library-delete-confirm, .board-library-rename {
  margin: 2px 0 12px 54px;
  padding: 9px;
  border-radius: 8px;
  background: var(--surface-tertiary);
}
.board-library-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.board-library-actions button { display: inline-flex; align-items: center; gap: 7px; background: transparent; }
.board-library-rename > div { flex-wrap: wrap; }
.board-library-delete-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.board-library-delete-confirm span { flex: 1 1 100%; font-size: 13px; line-height: 1.4; }
.board-library-actions .board-library-danger, .board-library-delete-confirm .board-library-danger { color: var(--danger); }
.board-library-empty {
  min-height: 144px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  color: var(--text-secondary);
}
.board-library-empty > svg { color: var(--text-muted); font-size: 22px; }
.board-library-empty strong { color: var(--text-primary); font-size: 15px; }
.board-library-empty p { max-width: 35ch; margin: 0; font-size: 13px; line-height: 1.4; }
.board-library-panel button:disabled { opacity: .55; cursor: default; }
.board-library-panel button:focus-visible, .board-library-panel input:focus-visible {
  outline: 2px solid var(--selected-bg);
  outline-offset: 2px;
}
@media (max-width: 600px) {
  .board-library-overlay { padding: 0; }
  .board-library-panel { width: 100%; max-height: none; height: 100vh; height: 100dvh; border-radius: 0; }
  .board-library-header { padding: max(20px, env(safe-area-inset-top)) 16px 16px; }
  .board-library-create { padding: 0 16px 18px; }
  .board-library-tabs { padding: 0 16px; }
  .board-library-content { flex: 1; padding: 4px 16px max(24px, env(safe-area-inset-bottom)); }
  .board-library-restore span { display: none; }
  .board-library-actions, .board-library-delete-confirm, .board-library-rename { margin-left: 0; }
}
</style>
