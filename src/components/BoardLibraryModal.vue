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
          <p>Boards on this device</p>
        </div>
        <button ref="closeButton" class="board-library-icon-button" type="button" :disabled="busy"
          aria-label="Close board library" @click="$emit('close')">
          <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
        </button>
      </header>

      <div class="board-library-workspace">
        <nav class="board-library-sidebar" aria-label="Board library views">
          <div class="board-library-tabs" role="group" aria-label="Board views">
            <button type="button" :class="{ active: !showArchived }" :aria-pressed="!showArchived"
              :disabled="busy || loading" @click="selectView(false)">
              <font-awesome-icon :icon="['fas', 'chalkboard']" aria-hidden="true" />
              <span>Recent<span v-if="!loading"> ({{ boards.length }})</span></span>
            </button>
            <button type="button" :class="{ active: showArchived }" :aria-pressed="showArchived"
              :disabled="busy || loading" @click="selectView(true)">
              <font-awesome-icon :icon="['fas', 'box-archive']" aria-hidden="true" />
              <span>Archived<span v-if="!loading"> ({{ archivedBoards.length }})</span></span>
            </button>
          </div>
        </nav>
        <div class="board-library-main">
          <div class="board-library-toolbar">
            <div class="board-library-search">
              <label for="board-library-search-input">Find a board</label>
              <div class="board-library-search-field">
                <input id="board-library-search-input" v-model="boardQuery" type="text" inputmode="search"
                  maxlength="120" autocomplete="off" placeholder="Find a board" :disabled="busy || loading">
                <font-awesome-icon :icon="['fas', 'search']" aria-hidden="true" />
              </div>
            </div>
            <button ref="newBoardButton" class="board-library-new-button" type="button" :disabled="busy || loading"
              :aria-expanded="showCreate" @click="beginCreate">
              <font-awesome-icon :icon="['fas', 'plus']" aria-hidden="true" />
              New board
            </button>
          </div>
          <form v-if="showCreate" class="board-library-new-form" @submit.prevent="createBoard"
            @keydown.esc.stop.prevent="cancelCreate">
            <label for="board-library-new-title">New board name</label>
            <div>
              <input id="board-library-new-title" ref="newTitleInput" v-model="newTitle" maxlength="120"
                autocomplete="off" placeholder="Untitled board" :disabled="busy">
              <button type="submit" :disabled="busy">Create board</button>
              <button type="button" :disabled="busy" @click="cancelCreate">Cancel</button>
            </div>
          </form>
          <p v-if="error" class="board-library-error" role="alert">{{ error }}</p>
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
                  <button class="board-library-glyph" type="button" :disabled="busy"
                    :aria-label="boardSelectionLabel(board)" :title="boardSelectionLabel(board)"
                    @click="selectBoard(board)">
                    <font-awesome-icon :icon="['fas', 'chalkboard']" aria-hidden="true" />
                  </button>
                  <div class="board-library-details">
                    <span v-if="board.isActive" class="board-library-current-name" :title="board.title">{{ board.title }}</span>
                    <button v-else type="button" class="board-library-open" :title="board.title"
                      :disabled="busy" @click="selectBoard(board)">{{ board.title }}</button>
                    <span class="board-library-meta">
                      <span v-if="board.isActive" class="board-library-kind">Current board</span>
                      <span v-if="board.isActive && board.updatedAt" aria-hidden="true"> · </span>
                      <time v-if="board.updatedAt" :datetime="board.updatedAt">{{ formatBoardDate(board.updatedAt) }}</time>
                      <span v-else-if="!board.isActive">Saved locally</span>
                    </span>
                  </div>
                </div>
                <div class="board-library-row-actions" role="group" :aria-label="'Actions for ' + board.title">
                  <button :id="'rename-action-' + board.id" type="button" :disabled="busy || showArchived"
                    :aria-label="'Rename ' + board.title + (showArchived ? ' (unarchive first)' : '')"
                    :title="showArchived ? 'Unarchive before renaming' : 'Rename ' + board.title"
                    @click="beginRename(board)">
                    <font-awesome-icon :icon="['fas', 'pen-to-square']" aria-hidden="true" />
                  </button>
                  <button v-if="showArchived" type="button" :disabled="busy"
                    :aria-label="'Unarchive ' + board.title" :title="'Unarchive ' + board.title"
                    @click="submitAction('unarchive', board.id)">
                    <font-awesome-icon :icon="['fas', 'undo']" aria-hidden="true" />
                  </button>
                  <button v-else type="button" :disabled="busy"
                    :aria-label="'Archive ' + board.title" :title="'Archive ' + board.title"
                    @click="submitAction('archive', board.id)">
                    <font-awesome-icon :icon="['fas', 'box-archive']" aria-hidden="true" />
                  </button>
                  <button :id="'delete-action-' + board.id" class="board-library-danger" type="button"
                    :disabled="busy" :aria-label="'Delete ' + board.title" :title="'Delete ' + board.title"
                    @click="beginDelete(board)">
                    <font-awesome-icon :icon="['fas', 'trash']" aria-hidden="true" />
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
              <strong>{{ boardQuery.trim() ? 'No matching boards' : showArchived ? 'No archived boards' : 'No saved boards yet' }}</strong>
              <p>{{ boardQuery.trim() ? 'Try another name or use New board.' : showArchived ? 'Boards you archive will appear here.' : 'Your current board will appear after its first edit.' }}</p>
            </div>
          </div>
        </div>
      </div>
      <p class="board-library-footnote">Boards save after edits in this browser. Local storage is not a backup.</p>
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
    error: { type: String, default: null },
  },
  emits: ['close', 'action'],
  setup(props, { emit }) {
    const boardQuery = ref('')
    const newTitle = ref('')
    const showCreate = ref(false)
    const newBoardButton = ref(null)
    const newTitleInput = ref(null)
    const renameId = ref(null)
    const renameTitle = ref('')
    const confirmDeleteId = ref(null)
    const showArchived = ref(false)
    const closeButton = ref(null)
    const dialogPanel = ref(null)
    const pendingFocus = ref(null)
    const visibleBoards = computed(() => {
      const boards = showArchived.value ? props.archivedBoards : props.boards
      const query = boardQuery.value.trim().toLocaleLowerCase()
      return query ? boards.filter(board => board.title.toLocaleLowerCase().includes(query)) : boards
    })
    const dateFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

    onMounted(() => closeButton.value?.focus())
    watch(() => props.busy, async (busy) => {
      if (busy || !pendingFocus.value) return
      await nextTick()
      const target = pendingFocus.value === 'close'
        ? closeButton.value
        : document.getElementById('rename-action-' + pendingFocus.value)
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
      renameId.value = null
      confirmDeleteId.value = null
    }
    const beginCreate = async () => {
      showCreate.value = true
      await nextTick()
      newTitleInput.value?.focus()
    }
    const cancelCreate = async () => {
      showCreate.value = false
      newTitle.value = ''
      await nextTick()
      newBoardButton.value?.focus()
    }
    const createBoard = () => {
      emit('action', { action: 'create', title: newTitle.value.trim() || undefined })
    }
    const boardSelectionLabel = (board) => {
      const action = board.isActive ? 'Continue with' : showArchived.value ? 'Unarchive and open' : 'Open'
      return `${action} ${board.title}`
    }
    const selectBoard = (board) => {
      if (board.isActive) emit('close')
      else {
        awaitActionFocus('close')
        emit('action', { action: showArchived.value ? 'unarchive-open' : 'open', boardId: board.id })
      }
    }
    const submitAction = (action, boardId) => {
      awaitActionFocus('close')
      emit('action', { action, boardId })
    }
    const beginRename = async (board) => {
      confirmDeleteId.value = null
      renameId.value = board.id
      renameTitle.value = board.title
      await nextTick()
      document.getElementById('rename-' + board.id)?.focus()
    }
    const beginDelete = async (board) => {
      renameId.value = null
      confirmDeleteId.value = board.id
      await nextTick()
      document.getElementById('confirm-delete-' + board.id)?.focus()
    }
    const cancelInline = async (boardId) => {
      const actionId = renameId.value === boardId ? 'rename-action-' : 'delete-action-'
      renameId.value = null
      confirmDeleteId.value = null
      await nextTick()
      document.getElementById(actionId + boardId)?.focus()
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
    return { boardQuery, newTitle, showCreate, newBoardButton, newTitleInput,
      renameId, renameTitle, confirmDeleteId, showArchived, closeButton, dialogPanel,
      visibleBoards, formatBoardDate, selectView, beginCreate, cancelCreate, createBoard, boardSelectionLabel, selectBoard, submitAction,
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
  align-items: flex-start;
  justify-content: center;
  padding: 72px 16px 16px;
  background: rgba(0, 0, 0, .3);
}
.board-library-panel {
  box-sizing: border-box;
  width: min(840px, 100%);
  max-height: calc(100dvh - 88px);
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
  padding: 18px 24px 16px;
  border-bottom: 1px solid var(--border-color);
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
.board-library-heading-icon { width: 42px; height: 42px; font-size: 18px; }
.board-library-heading-copy { flex: 1; min-width: 0; }
.board-library-heading-copy h2 { margin: 0; font-size: 20px; line-height: 1.25; }
.board-library-heading-copy p { margin: 4px 0 0; color: var(--text-secondary); font-size: 12px; }
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
.board-library-workspace { display: grid; grid-template-columns: 160px minmax(0, 1fr); flex: 1 1 auto; min-height: 0; }
.board-library-sidebar { padding: 16px 10px; border-right: 1px solid var(--border-color); background: var(--surface-tertiary); }
.board-library-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.board-library-toolbar { display: flex; align-items: center; gap: 12px; padding: 18px 20px 14px; }
.board-library-search { flex: 1; min-width: 0; }
.board-library-search label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
.board-library-rename label, .board-library-new-form label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}
.board-library-search-field { position: relative; }
.board-library-search-field > svg {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}
.board-library-rename > div, .board-library-new-form > div { display: flex; gap: 8px; }
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
.board-library-search-field input { width: 100%; padding-right: 42px; }
.board-library-new-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  flex: none;
  min-height: 44px;
  padding: 9px 14px;
  border: 0;
  border-radius: 8px;
  background: var(--selected-bg);
  color: var(--selected-text);
  font-weight: 600;
  cursor: pointer;
}
.board-library-new-button:hover:enabled { filter: brightness(.97); }
.board-library-new-form { margin: 0 20px 14px; padding: 12px; border-radius: 10px; background: var(--surface-tertiary); }
.board-library-new-form input { background: var(--surface-secondary); }
.board-library-error {
  margin: 0 20px 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--surface-tertiary);
  color: var(--danger);
  font-size: 13px;
  line-height: 1.4;
}
.board-library-panel input::placeholder { color: var(--text-secondary); }
.board-library-panel button { font: inherit; }
.board-library-new-form button, .board-library-rename button,
.board-library-delete-confirm button {
  min-height: 40px;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: var(--surface-tertiary);
  color: var(--text-primary);
  cursor: pointer;
}
.board-library-new-form button:hover:enabled, .board-library-rename button:hover:enabled,
.board-library-delete-confirm button:hover:enabled {
  box-shadow: inset 0 0 0 1px var(--border-color);
}
.board-library-new-form button[type="submit"] { background: var(--selected-bg); color: var(--selected-text); font-weight: 600; }
.board-library-footnote { flex: none; margin: 0; padding: 11px 24px; border-top: 1px solid var(--border-color); color: var(--text-secondary); font-size: 12px; line-height: 1.4; }
.board-library-tabs {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.board-library-tabs button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}
.board-library-tabs button:hover:enabled { background: var(--hover-bg); }
.board-library-tabs button.active { background: var(--surface-secondary); color: var(--text-primary); font-weight: 600; }
.board-library-tabs button > svg { width: 17px; }
.board-library-content {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 20px 20px;
  scrollbar-color: var(--border-color) transparent;
}
.board-library-loading { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.board-library-loading-row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 104px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
}
.board-library-loading-row span:first-child { width: 42px; height: 42px; border-radius: 8px; background: var(--surface-tertiary); }
.board-library-loading-row span:last-child { width: 45%; height: 12px; border-radius: 6px; background: var(--surface-tertiary); }
.board-library-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-content: start; list-style: none; padding: 0; margin: 0; }
.board-library-list li {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--surface-secondary);
}
.board-library-list li.is-active { border-color: var(--selected-bg); }
.board-library-row { display: flex; align-items: flex-start; gap: 12px; min-height: 72px; }
.board-library-glyph { width: 44px; height: 44px; border: 0; font-size: 17px; cursor: pointer; }
.board-library-glyph:hover:enabled { box-shadow: inset 0 0 0 1px var(--border-color); }
.is-active .board-library-glyph { background: var(--selected-bg); color: var(--selected-text); }
.board-library-details { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.board-library-current-name, .board-library-open {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow-wrap: anywhere;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
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
.board-library-meta { color: var(--text-secondary); font-size: 12px; line-height: 1.4; }
.board-library-kind { color: var(--text-primary); font-weight: 600; }
.board-library-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; margin-top: auto; padding-top: 6px; border-top: 1px solid var(--border-color); }
.board-library-row-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--icon-color);
  cursor: pointer;
}
.board-library-row-actions button:hover:enabled { background: var(--hover-bg); }
.board-library-delete-confirm, .board-library-rename {
  margin: 10px 0 0;
  padding: 9px;
  border-radius: 8px;
  background: var(--surface-tertiary);
}
.board-library-rename > div, .board-library-new-form > div { flex-wrap: wrap; }
.board-library-delete-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.board-library-delete-confirm span { flex: 1 1 100%; font-size: 13px; line-height: 1.4; }
.board-library-row-actions .board-library-danger, .board-library-delete-confirm .board-library-danger { color: var(--danger); }
.board-library-empty {
  min-height: 220px;
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
@media (max-width: 760px), (max-height: 560px) {
  .board-library-workspace { display: flex; flex-direction: column; }
  .board-library-sidebar { flex: none; padding: 8px 16px; border-right: 0; border-bottom: 1px solid var(--border-color); }
  .board-library-tabs { flex-direction: row; }
  .board-library-tabs button { width: auto; padding: 0 12px; }
  .board-library-main { flex: 1 1 auto; }
  .board-library-list, .board-library-loading { grid-template-columns: minmax(0, 1fr); }
  .board-library-row-actions button { width: 44px; height: 44px; }
}
@media (max-width: 600px) {
  .board-library-overlay { padding: 0; }
  .board-library-panel { width: 100%; max-height: none; height: 100vh; height: 100dvh; border-radius: 0; }
  .board-library-header { padding: max(18px, env(safe-area-inset-top)) 16px 14px; }
  .board-library-icon-button, .board-library-row-actions button { width: 44px; height: 44px; }
  .board-library-toolbar { padding: 14px 16px 12px; gap: 8px; }
  .board-library-new-button { padding: 9px 10px; }
  .board-library-new-form { margin: 0 16px 12px; }
  .board-library-new-form > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .board-library-new-form input { grid-column: 1 / -1; width: 100%; }
  .board-library-error { margin: 0 16px 12px; }
  .board-library-content { padding: 0 16px 16px; }
  .board-library-footnote { padding: 10px 16px max(14px, env(safe-area-inset-bottom)); }
}
@media (max-height: 560px) and (min-width: 601px) {
  .board-library-overlay { padding: 0; }
  .board-library-panel { height: 100dvh; max-height: none; border-radius: 0; }
  .board-library-content { min-height: 0; }
}
</style>
