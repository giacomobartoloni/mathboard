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
  <div class="zoom-panel">
    <button 
      class="zoom-button" 
      @click="$emit('zoom-in')" 
      title="Zoom In"
    >
      <span>+</span>
    </button>
    <font-awesome-icon :icon="['fas', 'search']" />
    <button 
      class="zoom-button" 
      @click="$emit('zoom-out')" 
      title="Zoom Out"
    >
    <span>−</span>
    </button>
    
    <button 
      class="zoom-button reset" 
      @click="$emit('reset-zoom')" 
      title="Reset Zoom"
    >
      <span>100%</span>
    </button>
    
    <div class="zoom-level">{{ zoomPercentage }}%</div>
    <div class="divider"></div>
    <button
      type="button"
      class="zoom-button theme-toggle"
      :title="uiTheme === 'dark' ? 'Switch to light UI' : 'Switch to dark UI'"
      :aria-label="uiTheme === 'dark' ? 'Switch to light UI' : 'Switch to dark UI'"
      @click="$emit('toggle-ui-theme')"
    >
      <font-awesome-icon :icon="['fas', uiTheme === 'dark' ? 'sun' : 'moon']" />
    </button>
    <select
      class="board-theme-select"
      :value="boardTheme"
      title="Board theme"
      aria-label="Board theme"
      @change="$emit('board-theme-change', $event.target.value)"
    >
      <option v-for="option in boardThemeOptions" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

<script>
import { BOARD_THEMES, BOARD_THEME_ORDER } from '../config/themes'

export default {
  name: 'ZoomPanel',
  props: {
    zoomLevel: {
      type: Number,
      default: 1
    },
    uiTheme: {
      type: String,
      default: 'light'
    },
    boardTheme: {
      type: String,
      default: 'light'
    }
  },
  emits: ['zoom-in', 'zoom-out', 'reset-zoom', 'toggle-ui-theme', 'board-theme-change'],
  computed: {
    zoomPercentage() {
      return Math.round(this.zoomLevel * 100)
    },
    boardThemeOptions() {
      return BOARD_THEME_ORDER.map((value) => ({
        value,
        label: BOARD_THEMES[value].label
      }))
    }
  }
}
</script>

<style scoped>
.zoom-panel {
  position: absolute;
  z-index: 10;
  right: 150px;
  bottom: 12px;
  
  background: var(--surface-primary);
  border-radius: 8px;
  padding: 8px 6px;
  box-shadow: var(--panel-shadow);
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 40px;
}

@media (max-width: 768px) {
  .zoom-panel {
    bottom: 25px;
  }
}

.zoom-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s ease;
  font-size: 16px;
  color: var(--icon-color);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
}

.zoom-button:hover {
  background-color: var(--hover-bg);
  transform: translateY(-1px);
}

.zoom-button:active {
  transform: translateY(0);
}

.zoom-button.reset {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.zoom-level {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 0 8px;
  min-width: 45px;
  text-align: center;
  background-color: var(--surface-tertiary);
  border-radius: 4px;
  padding: 4px 8px;
}

.divider {
  width: 1px;
  align-self: stretch;
  margin: 4px 2px;
  background-color: var(--border-color);
}

.theme-toggle {
  color: var(--icon-color);
}

.board-theme-select {
  background: var(--surface-muted);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.board-theme-select option {
  background: var(--surface-muted);
  color: var(--text-primary);
}
</style>
