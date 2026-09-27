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
  <div>
    <div class="tools-panel">
      <!--     <img alt="Vue logo" src="../assets/logo.png" width="30px" /> -->
      <div :class="{ selected: selected === 'select' }" @click="select('select')" title="Select (V)">
        <font-awesome-icon :icon="['fas', 'mouse-pointer']" />
      </div>
      <div :class="{ selected: selected === 'pan' }" @click="select('pan')" title="Pan (H)">
        <font-awesome-icon :icon="['far', 'hand-paper']" />
      </div>
      <div :class="{ selected: selected === 'pencil' }" @click="select('pencil')" title="Pen (P)">
        <font-awesome-icon :icon="['fas', 'pencil-alt']" />
      </div>
      <div :class="{ selected: selected === 'font' }" @click="select('font')" title="Text (T)">
        <font-awesome-icon :icon="['fas', 'font']" />
      </div>
      <div :class="{ selected: selected === 'formula' }" @click="select('formula')" title="Formula (F)">
        <font-awesome-icon :icon="['fas', 'square-root-alt']" />
      </div>
      <div 
        :class="{ selected: selected === 'shapes' }" 
        @click="select('shapes')"
        @mouseenter="showShapesSubmenu = true"
        @mouseleave="showShapesSubmenu = false"
        title="Shapes (S)"
      >
        <font-awesome-icon :icon="['fas', 'shapes']" />
        
        <!-- Submenu per le forme -->
        <transition name="fade">
          <div v-if="showShapesSubmenu && selected === 'shapes'" class="shapes-submenu" @click.stop>
            <div 
              :class="{ 'selected-shape': selectedShape === 'rectangle' }"
              @click="selectShape('rectangle')"
              title="Rectangle"
            >
              <font-awesome-icon :icon="['far', 'square']" />
            </div>
            <div 
              :class="{ 'selected-shape': selectedShape === 'circle' }"
              @click="selectShape('circle')"
              title="Circle"
            >
              <font-awesome-icon :icon="['far', 'circle']" />
            </div>
            <div 
              :class="{ 'selected-shape': selectedShape === 'arrow' }"
              @click="selectShape('arrow')"
              class="line-icon"
              title="Line"
            >
              |
            </div>
          </div>
        </transition>
      </div>

      <div class="color-control">
        <button
          type="button"
          class="color-indicator"
          :class="{ white: displayColor === '#ffffff' }"
          :style="{ background: displayColor }"
          aria-label="Pen color"
          :aria-expanded="paletteOpen ? 'true' : 'false'"
          @click="paletteOpen = !paletteOpen"
        ></button>
        <div v-if="paletteOpen" class="color-popover" role="group" aria-label="Pen colors">
          <button
            v-for="preset in colorPresets"
            :key="preset.id"
            type="button"
            class="swatch"
            :class="{ selected: selectedColor === preset.value, white: preset.value === '#ffffff' }"
            :style="{ background: preset.value }"
            :aria-label="preset.label"
            :aria-pressed="selectedColor === preset.value"
            @click="chooseColor(preset.value)"
          ></button>
          <label class="custom-color">
            Custom
            <input
              type="color"
              :value="displayColor"
              aria-label="Custom color"
              @input="chooseCustomColor($event.target.value)"
            />
          </label>
        </div>
      </div>

    </div>
    
    <div class="history-panel">
      <div @click="$emit('undo')" title="Undo (Ctrl+Z)">
        <font-awesome-icon :icon="['fas', 'undo']" />
      </div>
      <div @click="$emit('redo')" title="Redo (Ctrl+Shift+Z or Ctrl+Y)">
        <font-awesome-icon :icon="['fas', 'redo']" />
      </div>
    </div>
  </div>
</template>

<script>
import { COLOR_PRESETS, normalizeHexColor } from '../config/colors.js'

export default {
  name: "ToolsPanel",
  props: {
    selectedTool: {
      type: String,
      default: 'select'
    },
    selectedColor: {
      type: String,
      default: null
    },
    displayColor: {
      type: String,
      default: '#000000'
    }
  },
  data() {
    return {
      selected: "select",
      selectedShape: "rectangle",
      showShapesSubmenu: false,
      paletteOpen: false,
      colorPresets: COLOR_PRESETS,
      pencil: {
        width: 10,
        color: "(187, 187, 187)",
      },
      pan: {
      },
      text: {
      },
    };
  },
  methods: {
    select: function (element) {
      this.selected = element;
      this.$emit('tool-selected', element);
      if (element === 'shapes') {
        this.$emit('shape-selected', this.selectedShape);
      }
    },
    selectShape: function (shape) {
      this.selectedShape = shape;
      this.$emit('shape-selected', shape);
    },
    chooseColor(value) {
      this.$emit('color-selected', value);
      this.paletteOpen = false;
    },
    chooseCustomColor(value) {
      const normalized = normalizeHexColor(value);
      if (normalized) this.$emit('color-selected', normalized);
    }
  },
  watch: {
    selectedTool(newTool) {
      this.selected = newTool;
    }
  }
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.tools-panel {
  position: absolute;
  z-index: 10;
  left: 12px;
  top: max(15vh, 100px);

  background: var(--surface-primary);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 8px 6px;
  border: none;
  box-shadow: var(--panel-shadow);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tools-panel > div {
  padding: 8px 12px;
  border-radius: 6px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--icon-color);
}

.tools-panel > div:hover {
  background-color: var(--hover-bg);
  transform: translateY(-1px);
}

.tools-panel > div.selected {
  background-color: var(--selected-bg);
  color: var(--selected-text);
  box-shadow: var(--selected-shadow);
}

.history-panel {
  position: absolute;
  z-index: 10;
  left: 12px;
  top: calc(max(15vh, 100px) + 360px);

  background: var(--surface-primary);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 8px 6px;
  border: none;
  box-shadow: var(--panel-shadow);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-panel > div {
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--icon-color);
}

.history-panel > div:hover {
  background-color: var(--hover-bg);
  transform: translateY(-1px);
}

.shapes-submenu {
  position: absolute;
  left: 100%;
  top: -2px;
  margin-left: 10px;
  background: var(--surface-primary);
  border: none;
  border-radius: 8px;
  display: flex;
  flex-direction: row;
  padding: 6px 4px;
  white-space: nowrap;
  box-shadow: var(--panel-shadow);
}

.shapes-submenu > div {
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--icon-color);
}

.shapes-submenu > div:hover {
  background-color: var(--hover-bg);
  transform: translateY(-1px);
}

.shapes-submenu > div.selected-shape {
  background-color: var(--selected-bg);
  color: var(--selected-text);
  box-shadow: var(--selected-shadow);
}

.shapes-submenu > div.line-icon {
  font-size: 15px;
  font-weight: bold;
  width: 15px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.tools-panel > div.color-control:hover {
  transform: none;
  background: transparent;
}

.color-control {
  position: relative;
  display: flex;
  justify-content: center;
}

.color-indicator {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
}

.color-indicator.white,
.swatch.white {
  border: 1px solid var(--border-color);
}

.color-popover {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 10px;
  background: var(--surface-primary);
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  width: 148px;
  box-shadow: var(--panel-shadow);
}

.swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
}

.swatch.selected {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
}

.custom-color {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  color: var(--text-secondary);
  font-size: 12px;
}

.custom-color input[type="color"] {
  width: 28px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}
</style>
