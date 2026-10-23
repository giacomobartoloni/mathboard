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
  <div class="board-library-overlay" @click.self="$emit('close')" @keydown.esc.stop.prevent="$emit('close')">
    <section class="board-library-panel" role="dialog" aria-modal="true" aria-labelledby="board-library-heading">
      <header class="board-library-header">
        <h2 id="board-library-heading">Board library</h2>
        <button type="button" :disabled="busy" aria-label="Close board library" @click="$emit('close')">×</button>
      </header>
      <p>All boards are saved automatically in this browser after edits. Archived boards are hidden from this list; deleting a board permanently removes its local document. Local storage is not a backup.</p>
      <form class="board-library-create" @submit.prevent="createBoard">
        <label for="new-board-title">New board name (optional)</label>
        <div>
          <input id="new-board-title" v-model="newTitle" maxlength="120" autocomplete="off" placeholder="Untitled board" :disabled="busy">
          <button type="submit" :disabled="busy">New board</button>
        </div>
      </form>
      <h3>Recent boards</h3>
      <ul class="board-library-list">
        <li v-for="board in boards" :key="board.id">
          <form v-if="renameId === board.id" class="board-library-rename" @submit.prevent="submitRename(board.id)">
            <label :for="'rename-' + board.id">Rename board</label>
            <input :id="'rename-' + board.id" v-model="renameTitle" maxlength="120" :disabled="busy">
            <button type="submit" :disabled="busy || !renameTitle.trim()">Save name</button>
            <button type="button" :disabled="busy" @click="renameId = null">Cancel</button>
          </form>
          <template v-else>
            <button type="button" class="board-library-open" :disabled="busy || board.isActive"
              @click="$emit('action', { action: 'open', boardId: board.id })">{{ board.title }}</button>
            <span v-if="board.isActive" class="board-library-kind">Current</span>
            <button type="button" :disabled="busy" @click="beginRename(board)">Rename</button>
            <button type="button" :disabled="busy" @click="$emit('action', { action: 'archive', boardId: board.id })">Archive</button>
            <button type="button" :disabled="busy" @click="beginDelete(board)">Delete</button>
          </template>
          <div v-if="confirmDeleteId === board.id" class="board-library-delete-confirm" role="group" :aria-label="'Confirm deletion of ' + board.title">
            <span>Permanently delete “{{ board.title }}” from this device? This cannot be undone.</span>
            <button type="button" :disabled="busy" @click="submitDelete(board.id)">Permanently delete</button>
            <button type="button" :disabled="busy" @click="confirmDeleteId = null">Cancel</button>
          </div>
        </li>
      </ul>
      <p v-if="!boards.length" role="status">No local boards yet.</p>
      <button type="button" class="board-library-trash-toggle" :aria-expanded="showArchived" @click="showArchived = !showArchived">
        {{ showArchived ? 'Hide archived' : 'Archived' }} ({{ archivedBoards.length }})
      </button>
      <div v-if="showArchived" class="board-library-trash">
        <p>Archived boards remain editable after unarchiving. Archiving does not delete their content.</p>
        <ul class="board-library-list">
          <li v-for="board in archivedBoards" :key="board.id">
            <span class="board-library-trash-title">{{ board.title }}</span>
            <button type="button" :disabled="busy" @click="$emit('action', { action: 'unarchive', boardId: board.id })">Unarchive</button>
            <button type="button" :disabled="busy" @click="beginDelete(board)">Delete</button>
            <div v-if="confirmDeleteId === board.id" class="board-library-delete-confirm" role="group" :aria-label="'Confirm deletion of ' + board.title">
              <span>Permanently delete “{{ board.title }}” from this device? This cannot be undone.</span>
              <button type="button" :disabled="busy" @click="submitDelete(board.id)">Permanently delete</button>
              <button type="button" :disabled="busy" @click="confirmDeleteId = null">Cancel</button>
            </div>
          </li>
        </ul>
        <p v-if="!archivedBoards.length" role="status">No archived boards.</p>
      </div>
    </section>
  </div>
</template>

<script>
import { ref } from 'vue'

export default {
  name: 'BoardLibraryModal',
  props: {
    boards: { type: Array, default: () => [] },
    archivedBoards: { type: Array, default: () => [] },
    busy: { type: Boolean, default: false },
  },
  emits: ['close', 'action'],
  setup(_props, { emit }) {
    const newTitle = ref('')
    const renameId = ref(null)
    const renameTitle = ref('')
    const confirmDeleteId = ref(null)
    const showArchived = ref(false)
    const createBoard = () => {
      emit('action', { action: 'create', title: newTitle.value.trim() || undefined })
      newTitle.value = ''
    }
    const beginRename = (board) => {
      confirmDeleteId.value = null
      renameId.value = board.id
      renameTitle.value = board.title
    }
    const beginDelete = (board) => {
      renameId.value = null
      confirmDeleteId.value = board.id
    }
    const submitDelete = (boardId) => {
      confirmDeleteId.value = null
      emit('action', { action: 'delete', boardId })
    }
    const submitRename = (boardId) => {
      if (!renameTitle.value.trim()) return
      emit('action', { action: 'rename', boardId, title: renameTitle.value.trim() })
      renameId.value = null
    }
    return { newTitle, renameId, renameTitle, confirmDeleteId, showArchived,
      createBoard, beginRename, submitRename, beginDelete, submitDelete }
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
  padding: 16px;
  background: rgba(0, 0, 0, .45);
}
.board-library-panel {
  box-sizing: border-box;
  width: min(560px, 100%);
  max-height: min(80vh, 720px);
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  box-shadow: var(--panel-shadow);
  text-align: left;
}
.board-library-header, .board-library-create > div, .board-library-list li {
  display: flex;
  align-items: center;
  gap: 10px;
}
.board-library-header { justify-content: space-between; }
.board-library-panel h2, .board-library-panel h3 { margin: 0 0 12px; }
.board-library-panel p { font-size: 13px; color: var(--text-secondary); }
.board-library-panel button, .board-library-panel input {
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  font: inherit;
  color: var(--text-primary);
  background: var(--surface-secondary);
}
.board-library-panel button { cursor: pointer; }
.board-library-panel button:hover:enabled { background: var(--hover-bg); }
.board-library-panel button:disabled { opacity: .55; cursor: default; }
.board-library-create label, .board-library-rename label { font-size: 13px; }
.board-library-create input { flex: 1; min-width: 0; }
.board-library-save { margin: 14px 0 20px; }
.board-library-list { list-style: none; padding: 0; margin: 0; }
.board-library-list li { padding: 9px 0; border-top: 1px solid var(--border-color); flex-wrap: wrap; }
.board-library-open { flex: 1; min-width: 100px; text-align: left; overflow-wrap: anywhere; }
.board-library-kind { font-size: 12px; color: var(--text-secondary); }
.board-library-rename { display: flex; flex: 1; flex-wrap: wrap; align-items: center; gap: 8px; }
.board-library-rename input { flex: 1; min-width: 120px; }
.board-library-delete-confirm { display: flex; gap: 8px; width: 100%; flex-wrap: wrap; align-items: center; font-size: 13px; }
.board-library-delete-confirm span { flex: 1; min-width: 160px; }
.board-library-trash-toggle { margin-top: 18px; }
.board-library-trash-title { flex: 1; min-width: 100px; overflow-wrap: anywhere; }
</style>
