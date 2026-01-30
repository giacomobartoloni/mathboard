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
  </div>
</template>

<script>
export default {
  name: 'ZoomPanel',
  props: {
    zoomLevel: {
      type: Number,
      default: 1
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
  
  background: linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%);
  border-radius: 8px;
  padding: 8px 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 
              0 2px 4px rgba(0, 0, 0, 0.1);
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
}

.zoom-button:hover {
  background-color: rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.zoom-button:active {
  transform: translateY(0);
}

.zoom-button.reset {
  font-size: 12px;
  font-weight: 600;
  color: #333;
}

.zoom-level {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  padding: 0 8px;
  min-width: 45px;
  text-align: center;
  background-color: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
  padding: 4px 8px;
}
</style>
