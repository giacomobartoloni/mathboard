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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
-->

<template>
  <div
    v-show="visible"
    class="selection-actions"
    role="toolbar"
    :aria-label="toolbarLabel"
    :data-placement="placement"
    :data-selection-type="selectionType"
    :style="metricsStyle"
    @pointerdown.stop
    @mousedown.stop
    @click.stop
  >
    <button
      v-for="action in resolvedActions"
      :key="action.id"
      type="button"
      :class="{ 'is-danger': action.id === 'delete' }"
      :title="action.title"
      :aria-label="action.label"
      @click.stop="onAction(action.id)"
    >
      <font-awesome-icon :icon="action.icon" />
    </button>
    <div v-if="isTextSelection" class="text-style-controls">
      <label>
        <span>Font</span>
        <select aria-label="Text font family" :value="textStyle.fontFamily"
          @change="$emit('text-style', { fontFamily: $event.target.value })">
          <option value="Arial">Sans</option>
          <option value="serif">Serif</option>
          <option value="monospace">Mono</option>
          <option v-if="!fontFamilies.includes(textStyle.fontFamily)"
            :value="textStyle.fontFamily">{{ textStyle.fontFamily }}</option>
        </select>
      </label>
      <label>
        <span>Size</span>
        <select aria-label="Text font size" :value="textStyle.fontSize"
          @change="$emit('text-style', { fontSize: Number($event.target.value) })">
          <option v-for="size in fontSizes" :key="size" :value="size">{{ size }} px</option>
          <option v-if="!fontSizes.includes(textStyle.fontSize)"
            :value="textStyle.fontSize">{{ textStyle.fontSize }} px</option>
        </select>
      </label>
    </div>
  </div>
</template>

<script>
import { PANEL_ACTION_GAP, PANEL_BUTTON, PANEL_PAD } from '../config/selectionActions'

const ACTION_CATALOG = {
  edit: {
    label: 'Edit formula',
    title: 'Edit formula',
    icon: ['fas', 'pen-to-square'],
  },
  group: {
    label: 'Group',
    title: 'Group (Ctrl+G)',
    icon: ['fas', 'object-group'],
  },
  ungroup: {
    label: 'Ungroup',
    title: 'Ungroup (Ctrl+Shift+G)',
    icon: ['fas', 'object-ungroup'],
  },
  duplicate: {
    label: 'Duplicate',
    title: 'Duplicate (Ctrl+D)',
    icon: ['fas', 'copy'],
  },
  delete: {
    label: 'Delete selection',
    title: 'Delete selection',
    icon: ['fas', 'trash'],
  },
}

export default {
  name: 'SelectionActionsPanel',
  props: {
    visible: { type: Boolean, default: false },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    placement: { type: String, default: 'top' },
    selectionType: { type: String, default: null },
    selectionCount: { type: Number, default: 0 },
    actions: { type: Array, default: () => [] },
    textStyle: { type: Object, default: null },
  },
  emits: ['action', 'text-style'],
  computed: {
    isTextSelection() {
      return this.selectionType === 'text' && Boolean(this.textStyle)
    },
    fontFamilies() {
      return ['Arial', 'serif', 'monospace']
    },
    fontSizes() {
      return [16, 24, 32, 48, 64, 96]
    },
    toolbarLabel() {
      if (this.selectionCount > 1) {
        return `Selection actions, ${this.selectionCount} objects`
      }
      return 'Selection actions'
    },
    resolvedActions() {
      return this.actions
        .map((id) => (ACTION_CATALOG[id] ? { id, ...ACTION_CATALOG[id] } : null))
        .filter(Boolean)
    },
    metricsStyle() {
      return {
        left: `${this.x}px`,
        top: `${this.y}px`,
        '--selection-action-size': `${PANEL_BUTTON}px`,
        '--selection-panel-pad': `${PANEL_PAD}px`,
        '--selection-action-gap': `${PANEL_ACTION_GAP}px`,
      }
    },
  },
  methods: {
    onAction(actionId) {
      this.$emit('action', actionId)
    },
  },
}
</script>

<style scoped>
.selection-actions {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--selection-action-gap);
  padding: var(--selection-panel-pad);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--surface-secondary);
  box-shadow: var(--panel-shadow);
  pointer-events: auto;
}

.selection-actions button {
  appearance: none;
  box-sizing: border-box;
  width: var(--selection-action-size);
  height: var(--selection-action-size);
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--icon-color);
  cursor: pointer;
  touch-action: manipulation;
}

.selection-actions button:hover {
  background: var(--hover-bg);
}

.selection-actions button.is-danger:hover,
.selection-actions button.is-danger:focus-visible {
  background: var(--danger-hover);
  color: var(--danger);
}

.selection-actions button:focus {
  outline: none;
}

.selection-actions button:focus-visible {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
}
  .text-style-controls {
    display: grid;
    gap: 4px;
    width: 100%;
  }
  .text-style-controls label {
    display: grid;
    gap: 2px;
    font-size: 11px;
    color: var(--text-primary);
  }
  .text-style-controls select {
    width: 100%;
    min-width: 0;
    height: 27px;
    font-size: 12px;
    color: var(--text-primary);
    background: var(--surface-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
  }
</style>
