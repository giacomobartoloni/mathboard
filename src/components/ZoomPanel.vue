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
  <div class="zoom-panel" role="toolbar" aria-label="Board view and history">
    <div class="control-group" role="group" aria-label="Zoom">
      <button class="zoom-button" type="button" aria-label="Zoom out" title="Zoom Out (Ctrl+-)" @click="$emit('zoom-out')">−</button>
      <button class="zoom-button reset" type="button" :aria-label="`Reset zoom to 100% (current ${zoomPercentage}%)`"
        title="Reset Zoom (Ctrl+0)" @click="$emit('reset-zoom')">{{ zoomPercentage }}%</button>
      <button class="zoom-button" type="button" aria-label="Zoom in" title="Zoom In (Ctrl+=)" @click="$emit('zoom-in')">+</button>
    </div>
    <span class="divider" aria-hidden="true"></span>
    <div class="control-group" role="group" aria-label="History">
      <button class="zoom-button" type="button" aria-label="Undo" title="Undo (Ctrl+Z)" @click="$emit('undo')">
        <font-awesome-icon :icon="['fas', 'undo']" />
      </button>
      <button class="zoom-button" type="button" aria-label="Redo" title="Redo (Ctrl+Shift+Z or Ctrl+Y)" @click="$emit('redo')">
        <font-awesome-icon :icon="['fas', 'redo']" />
      </button>
    </div>
    <span class="divider" aria-hidden="true"></span>
    <div class="control-group" role="group" aria-label="Display">
      <button type="button" class="zoom-button theme-toggle" :title="themeToggleLabel" :aria-label="themeToggleLabel"
        @click="$emit('cycle-theme')">
        <font-awesome-icon :icon="['fas', themeIcon]" />
      </button>
      <button v-if="fullscreenSupported" type="button" class="zoom-button fullscreen-toggle"
        :title="fullscreenLabel" :aria-label="fullscreenLabel" :aria-pressed="isFullscreen ? 'true' : 'false'"
        @click="$emit('toggle-fullscreen')">
        <font-awesome-icon :icon="['fas', fullscreenIcon]" />
      </button>
    </div>
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
  emits: ['zoom-in', 'zoom-out', 'reset-zoom', 'undo', 'redo', 'cycle-theme', 'toggle-fullscreen'],
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
  left: 12px;
  bottom: 12px;
  background: var(--surface-primary);
  border-radius: 8px;
  padding: 6px;
  box-shadow: var(--panel-shadow);
  display: flex;
  gap: 3px;
  align-items: center;
  min-height: 44px;
}

.control-group {
  display: flex;
  align-items: center;
}

.zoom-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
  font-size: 16px;
  color: var(--icon-color);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 40px;
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
  min-width: 52px;
}

.divider {
  width: 1px;
  align-self: stretch;
  margin: 6px 3px;
  background-color: var(--border-color);
}

@media (max-width: 600px) {
  .zoom-panel {
    right: 12px;
    bottom: max(12px, env(safe-area-inset-bottom));
    justify-content: space-between;
  }
}

@media (max-width: 360px) {
  .zoom-panel { gap: 0; padding: 4px; }
  .zoom-button { min-width: 34px; padding: 6px; }
  .zoom-button.reset { min-width: 45px; }
  .divider { margin: 6px 1px; }
}

.theme-toggle,
.fullscreen-toggle {
  color: var(--icon-color);
}
</style>
