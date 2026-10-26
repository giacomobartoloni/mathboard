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
      aria-labelledby="board-library-heading" :aria-busy="busy" tabindex="-1" @click="onPanelClick">
      <header class="board-library-header">
        <span class="board-library-heading-icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'chalkboard']" />
        </span>
        <div class="board-library-heading-copy">
          <h2 id="board-library-heading">Board library</h2>
        </div>
        <button ref="closeButton" class="board-library-icon-button" type="button" :disabled="busy"
          aria-label="Close board library" @click="$emit('close')">
          <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
        </button>
      </header>

      <div class="board-library-search">
        <label for="board-library-search-input">Find or create a board</label>
        <div class="board-library-search-field">
          <input id="board-library-search-input" v-model="boardQuery" type="text" inputmode="search"
            maxlength="120" autocomplete="off" placeholder="Find or create a board" :disabled="busy || loading">
          <font-awesome-icon :icon="['fas', 'search']" aria-hidden="true" />
        </div>
      </div>
      <p v-if="error" class="board-library-error" role="alert">{{ error }}</p>

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
              <button class="board-library-glyph" type="button" :disabled="busy"
                :aria-label="boardSelectionLabel(board)" :title="boardSelectionLabel(board)"
                @click="selectBoard(board)">
                <font-awesome-icon :icon="['fas', 'chalkboard']" aria-hidden="true" />
              </button>
              <div class="board-library-details">
                <span v-if="board.isActive" class="board-library-current-name" :title="board.title">{{ board.title }}</span>
                <button v-else-if="!showArchived" type="button" class="board-library-open" :title="board.title"
                  :disabled="busy" @click="selectBoard(board)">{{ board.title }}</button>
                <span v-else class="board-library-current-name" :title="board.title">{{ board.title }}</span>
                <span class="board-library-meta">
                  <span v-if="board.isActive" class="board-library-kind">Current board</span>
                  <span v-if="board.isActive && board.updatedAt" aria-hidden="true"> · </span>
                  <time v-if="board.updatedAt" :datetime="board.updatedAt">{{ formatBoardDate(board.updatedAt) }}</time>
                  <span v-else-if="!board.isActive">Saved locally</span>
                </span>
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
                <button :id="'more-action-' + board.id" type="button" :disabled="busy"
                  :aria-label="'More actions for ' + board.title" :title="'More actions for ' + board.title"
                  :aria-expanded="moreMenuId === board.id" aria-haspopup="menu"
                  :aria-controls="'more-menu-' + board.id" @click="toggleMoreMenu(board.id)">
                  <font-awesome-icon :icon="['fas', 'ellipsis']" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div v-if="moreMenuId === board.id" :id="'more-menu-' + board.id"
              class="board-library-more-menu" role="menu" :aria-label="'More actions for ' + board.title"
              @keydown.esc.stop.prevent="closeMoreMenu(board.id)"
              @keydown.down.prevent="focusDelete(board.id)" @keydown.up.prevent="focusDelete(board.id)"
              @focusout="onMoreMenuFocusOut">
              <button :id="'delete-action-' + board.id" class="board-library-more-delete" type="button"
                role="menuitem" :disabled="busy" :aria-label="'Delete ' + board.title"
                @click="beginDelete(board)">
                <font-awesome-icon :icon="['fas', 'trash']" aria-hidden="true" />
                <span>Delete</span>
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
          <p>{{ boardQuery.trim() ? 'Try another name or create a board below.' : showArchived ? 'Boards you archive will appear here.' : 'Your current board will appear after its first edit.' }}</p>
        </div>
      </div>
      <div class="board-library-create">
        <button class="board-library-create-button" type="button" :disabled="busy || loading"
          :title="createLabel" @click="createBoard">
          <font-awesome-icon :icon="['fas', 'plus']" aria-hidden="true" />
          <span>{{ createLabel }}</span>
        </button>
        <BoardStorageNotice :is-desktop="isDesktop" />
      </div>
    </section>
  </div>
</template>

<script>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import BoardStorageNotice from './BoardStorageNotice.vue'

export default {
  name: 'BoardLibraryModal',
  components: { BoardStorageNotice },
  props: {
    isDesktop: { type: Boolean, default: false },
    boards: { type: Array, default: () => [] },
    archivedBoards: { type: Array, default: () => [] },
    busy: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    error: { type: String, default: null },
  },
  emits: ['close', 'action'],
  setup(props, { emit }) {
    const boardQuery = ref('')
    const renameId = ref(null)
    const renameTitle = ref('')
    const confirmDeleteId = ref(null)
    const moreMenuId = ref(null)
    const showArchived = ref(false)
    const closeButton = ref(null)
    const dialogPanel = ref(null)
    const pendingFocus = ref(null)
    const visibleBoards = computed(() => {
      const boards = showArchived.value ? props.archivedBoards : props.boards
      const query = boardQuery.value.trim().toLocaleLowerCase()
      return query ? boards.filter(board => board.title.toLocaleLowerCase().includes(query)) : boards
    })
    const createLabel = computed(() => boardQuery.value.trim() ? `Create “${boardQuery.value.trim()}”` : 'New board')
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
      moreMenuId.value = null
    }
    const focusDelete = (boardId) => document.getElementById('delete-action-' + boardId)?.focus()
    const closeMoreMenu = async (boardId) => {
      moreMenuId.value = null
      await nextTick()
      document.getElementById('more-action-' + boardId)?.focus()
    }
    const toggleMoreMenu = async (boardId) => {
      if (moreMenuId.value === boardId) {
        await closeMoreMenu(boardId)
        return
      }
      renameId.value = null
      confirmDeleteId.value = null
      moreMenuId.value = boardId
      await nextTick()
      focusDelete(boardId)
    }
    const onPanelClick = (event) => {
      if (moreMenuId.value && !event.target.closest('.board-library-more-menu, [id^="more-action-"]')) {
        moreMenuId.value = null
      }
    }
    const onMoreMenuFocusOut = (event) => {
      // A null focus destination must not dismiss Delete before its pointer click.
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) moreMenuId.value = null
    }
    const createBoard = () => {
      emit('action', { action: 'create', title: boardQuery.value.trim() || undefined })
    }
    const boardSelectionLabel = (board) => {
      const action = board.isActive ? 'Continue with' : showArchived.value ? 'Unarchive and open' : 'Open'
      return `${action} ${board.title}`
    }
    const selectBoard = (board) => {
      moreMenuId.value = null
      if (board.isActive) emit('close')
      else {
        awaitActionFocus('close')
        emit('action', { action: showArchived.value ? 'unarchive-open' : 'open', boardId: board.id })
      }
    }
    const submitAction = (action, boardId) => {
      moreMenuId.value = null
      awaitActionFocus('close')
      emit('action', { action, boardId })
    }
    const beginRename = async (board) => {
      moreMenuId.value = null
      confirmDeleteId.value = null
      renameId.value = board.id
      renameTitle.value = board.title
      await nextTick()
      document.getElementById('rename-' + board.id)?.focus()
    }
    const beginDelete = async (board) => {
      moreMenuId.value = null
      renameId.value = null
      confirmDeleteId.value = board.id
      await nextTick()
      document.getElementById('confirm-delete-' + board.id)?.focus()
    }
    const cancelInline = async (boardId) => {
      const actionId = renameId.value === boardId ? 'rename-action-' : 'more-action-'
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
    return { boardQuery, renameId, renameTitle, confirmDeleteId, moreMenuId, showArchived, closeButton, dialogPanel,
      visibleBoards, createLabel, formatBoardDate, selectView, createBoard, boardSelectionLabel, selectBoard, submitAction,
      submitRename, beginRename, beginDelete, cancelInline, submitDelete, trapTab,
      toggleMoreMenu, closeMoreMenu, focusDelete, onPanelClick, onMoreMenuFocusOut }
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
  padding: 68px 16px 16px;
  background: rgba(0, 0, 0, .22);
}
.board-library-panel {
  box-sizing: border-box;
  width: min(560px, 100%);
  max-height: calc(100dvh - 84px);
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
  align-items: center;
  gap: 14px;
  padding: 14px 20px 10px;
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
.board-library-heading-icon { width: 40px; height: 40px; font-size: 18px; }
.board-library-heading-copy { flex: 1; min-width: 0; }
.board-library-heading-copy h2 { margin: 0; font-size: 19px; line-height: 1.3; }
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
.board-library-search { padding: 0 20px 12px; }
.board-library-search label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
.board-library-rename label {
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
.board-library-rename > div { display: flex; gap: 8px; }
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
.board-library-error {
  margin: 0 20px 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--surface-tertiary);
  color: var(--danger);
  font-size: 13px;
  line-height: 1.4;
}
.board-library-panel input::placeholder { color: var(--text-placeholder); }
.board-library-panel button { font: inherit; }
.board-library-rename button,
.board-library-delete-confirm button {
  min-height: 40px;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: var(--surface-tertiary);
  color: var(--text-primary);
  cursor: pointer;
}
.board-library-rename button:hover:enabled,
.board-library-delete-confirm button:hover:enabled {
  box-shadow: inset 0 0 0 1px var(--border-color);
}
.board-library-create { flex: none; padding: 10px 20px 14px; border-top: 1px solid var(--border-color); }
.board-library-create p { margin: 4px 12px 0; color: var(--text-secondary); font-size: 12px; line-height: 1.4; }
.board-library-create-button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.board-library-create-button:hover:enabled { background: var(--hover-bg); }
.board-library-create-button > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-library-tabs {
  display: flex;
  gap: 18px;
  padding: 0 20px;
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
  min-height: 100px;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 4px 20px 12px;
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
.board-library-glyph { width: 42px; height: 42px; border: 0; font-size: 17px; cursor: pointer; }
.board-library-glyph:hover:enabled { box-shadow: inset 0 0 0 1px var(--border-color); }
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
.board-library-row-actions { display: flex; align-items: center; flex: none; gap: 2px; }
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
.board-library-more-menu {
  display: flex;
  justify-content: flex-end;
  margin: 0 0 6px;
}
.board-library-more-delete {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 140px;
  min-height: 44px;
  padding: 9px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--surface-secondary);
  color: var(--danger);
  box-shadow: var(--panel-shadow);
  text-align: left;
  cursor: pointer;
}
.board-library-more-delete:hover:enabled { background: var(--hover-bg); }
.board-library-delete-confirm, .board-library-rename {
  margin: 2px 0 12px 54px;
  padding: 9px;
  border-radius: 8px;
  background: var(--surface-tertiary);
}
.board-library-rename > div { flex-wrap: wrap; }
.board-library-delete-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.board-library-delete-confirm span { flex: 1 1 100%; font-size: 13px; line-height: 1.4; }
.board-library-delete-confirm .board-library-danger { color: var(--danger); }
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
  .board-library-icon-button, .board-library-glyph, .board-library-row-actions button { width: 44px; height: 44px; }
  .board-library-search { padding: 0 16px 12px; }
  .board-library-error { margin: 0 16px 12px; }
  .board-library-create { padding: 10px 16px max(14px, env(safe-area-inset-bottom)); }
  .board-library-tabs { padding: 0 16px; }
  .board-library-content { min-height: 0; padding: 4px 16px 12px; }
  .board-library-delete-confirm, .board-library-rename { margin-left: 0; }
}
@media (max-height: 560px) and (min-width: 601px) {
  .board-library-overlay { padding: 0; }
  .board-library-panel { height: 100dvh; max-height: none; border-radius: 0; }
  .board-library-content { min-height: 0; }
}
@media (max-width: 420px) {
  .board-library-row {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 4px 12px;
    padding: 6px 0;
  }
  .board-library-glyph { grid-column: 1; grid-row: 1; }
  .board-library-details { grid-column: 2; grid-row: 1; }
  .board-library-row-actions { grid-column: 2; grid-row: 2; justify-self: end; }
}
</style>
