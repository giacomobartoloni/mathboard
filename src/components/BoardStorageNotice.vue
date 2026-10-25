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
  <section class="board-storage-notice" aria-label="Board storage and sync">
    <div class="board-storage-summary">
      <div class="board-storage-copy">
        <strong>{{ notice.title }}</strong>
        <span>{{ notice.summary }}</span>
      </div>
      <button type="button" class="board-storage-info" :aria-expanded="detailsOpen"
        aria-controls="board-storage-details" aria-label="About board storage and sync"
        title="About board storage and sync" @click="detailsOpen = !detailsOpen">
        <font-awesome-icon :icon="['fas', 'info-circle']" aria-hidden="true" />
      </button>
    </div>
    <div v-show="detailsOpen" id="board-storage-details" class="board-storage-details"
      role="region" aria-label="Board storage details">
      <p>{{ notice.localLocation }}</p>
      <p>{{ notice.cloudExplanation }}</p>
      <p>{{ notice.dataWarning }}</p>
    </div>
  </section>
</template>

<script>
import { computed, ref } from 'vue'
import { CLOUD_SYNC_STATUSES, getBoardStorageNotice } from '../board/storage/boardStorageNotice.js'

export default {
  name: 'BoardStorageNotice',
  props: {
    isDesktop: { type: Boolean, default: false },
    cloudSyncStatus: { type: String, default: CLOUD_SYNC_STATUSES.OFF },
  },
  setup(props) {
    const detailsOpen = ref(false)
    const notice = computed(() => getBoardStorageNotice({
      isDesktop: props.isDesktop,
      cloudSyncStatus: props.cloudSyncStatus,
    }))
    return { detailsOpen, notice }
  },
}
</script>

<style scoped>
.board-storage-notice { margin-top: 8px; }
.board-storage-summary { display: flex; align-items: center; gap: 10px; }
.board-storage-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.board-storage-copy strong { font-size: 13px; font-weight: 600; }
.board-storage-copy span { font-size: 12px; line-height: 1.4; color: var(--text-secondary); }
.board-storage-info { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex: none; border: 0; border-radius: 8px; background: transparent; color: var(--icon-color); cursor: pointer; }
.board-storage-info:hover { background: var(--hover-bg); }
.board-storage-info:focus-visible { outline: 2px solid var(--selected-bg); outline-offset: 2px; }
.board-storage-details { max-height: min(28vh, 170px); overflow-y: auto; padding: 8px 0 2px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.board-storage-details p { margin: 0 0 8px; }
.board-storage-details p:last-child { margin-bottom: 0; }
</style>
