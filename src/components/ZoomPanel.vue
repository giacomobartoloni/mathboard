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
      class="zoom-button dark-mode-toggle" 
      @click="$emit('toggle-dark-mode')" 
      :title="isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
    >
      <font-awesome-icon :icon="['fas', isDarkMode ? 'sun' : 'moon']" />
    </button>
  </div>
</template>

<script>
export default {
  name: 'ZoomPanel',
  props: {
    zoomLevel: {
      type: Number,
      default: 1
    },
    isDarkMode: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    zoomPercentage() {
      return Math.round(this.zoomLevel * 100)
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
  
  background: var(--panel-bg);
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
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  color: var(--panel-icon-color);
}

.zoom-button:hover {
  background-color: var(--panel-hover-bg);
  transform: translateY(-1px);
}

.zoom-button:active {
  transform: translateY(0);
}

.zoom-button.reset {
  font-size: 12px;
  font-weight: 600;
  color: var(--zoom-reset-color);
}

.zoom-level {
  font-size: 12px;
  font-weight: 600;
  color: var(--zoom-level-color);
  padding: 4px 8px;
  min-width: 45px;
  text-align: center;
  background-color: var(--zoom-level-bg);
  border-radius: 4px;
}

.divider {
  width: 1px;
  height: 24px;
  background-color: var(--modal-border);
  margin: 0 2px;
}

.dark-mode-toggle {
  font-size: 14px;
  min-width: 36px;
  padding: 8px 10px;
  color: var(--panel-icon-color);
}

.dark-mode-toggle:hover {
  color: #f5a623;
}
</style>
