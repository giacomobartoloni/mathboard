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
    <font-awesome-icon class="zoom-search-icon" :icon="['fas', 'search']" aria-hidden="true" />
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
      :title="themeToggleLabel"
      :aria-label="themeToggleLabel"
      @click="$emit('cycle-theme')"
    >
      <font-awesome-icon :icon="['fas', themeIcon]" />
    </button>
    <button
      v-if="fullscreenSupported"
      type="button"
      class="zoom-button fullscreen-toggle"
      :title="fullscreenLabel"
      :aria-label="fullscreenLabel"
      :aria-pressed="isFullscreen ? 'true' : 'false'"
      @click="$emit('toggle-fullscreen')"
    >
      <font-awesome-icon :icon="['fas', fullscreenIcon]" />
    </button>
  </div>
</template>

<script>
import { BOARD_THEMES, cycleBoardTheme, normalizeBoardTheme } from '../config/themes'

const THEME_ICONS = {
  light: 'sun',
  dark: 'moon',
  chalkboard: 'chalkboard',
}

export default {
  name: 'ZoomPanel',
  props: {
    zoomLevel: {
      type: Number,
      default: 1
    },
    boardTheme: {
      type: String,
      default: 'light'
    },
    isFullscreen: {
      type: Boolean,
      default: false
    },
    fullscreenSupported: {
      type: Boolean,
      default: true
    }
  },
  emits: ['zoom-in', 'zoom-out', 'reset-zoom', 'cycle-theme', 'toggle-fullscreen'],
  computed: {
    zoomPercentage() {
      return Math.round(this.zoomLevel * 100)
    },
    currentBoardTheme() {
      return normalizeBoardTheme(this.boardTheme)
    },
    themeIcon() {
      return THEME_ICONS[this.currentBoardTheme]
    },
    themeToggleLabel() {
      const current = BOARD_THEMES[this.currentBoardTheme].label
      const next = BOARD_THEMES[cycleBoardTheme(this.currentBoardTheme)].label
      return `Theme: ${current} — click for ${next}`
    },
    fullscreenIcon() {
      return this.isFullscreen ? 'compress' : 'expand'
    },
    fullscreenLabel() {
      return this.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
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
    right: 12px;
    bottom: 25px;
  }

  .zoom-search-icon {
    display: none;
  }

  .zoom-level {
    display: none;
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

.zoom-button:focus-visible {
  outline: 2px solid var(--selected-bg);
  outline-offset: 2px;
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

.theme-toggle,
.fullscreen-toggle {
  color: var(--icon-color);
}
</style>
