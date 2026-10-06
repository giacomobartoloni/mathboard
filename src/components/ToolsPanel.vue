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
  <div class="left-chrome">
    <div class="tools-panel" role="toolbar" aria-label="Drawing tools">
      <button
        type="button"
        class="tool-button"
        :class="{ selected: selected === 'select' }"
        :aria-pressed="selected === 'select'"
        aria-label="Select"
        title="Select (V)"
        @click="select('select')"
      >
        <font-awesome-icon :icon="['fas', 'mouse-pointer']" />
      </button>
      <button
        type="button"
        class="tool-button"
        :class="{ selected: selected === 'pan' }"
        :aria-pressed="selected === 'pan'"
        aria-label="Pan"
        title="Pan (H)"
        @click="select('pan')"
      >
        <font-awesome-icon :icon="['far', 'hand-paper']" />
      </button>
      <button
        type="button"
        class="tool-button"
        :class="{ selected: selected === 'pencil' }"
        :aria-pressed="selected === 'pencil'"
        aria-label="Pen"
        title="Pen (P)"
        @click="select('pencil')"
      >
        <font-awesome-icon :icon="['fas', 'pencil-alt']" />
      </button>
      <button
        type="button"
        class="tool-button"
        :class="{ selected: selected === 'font' }"
        :aria-pressed="selected === 'font'"
        aria-label="Text"
        title="Text (T)"
        @click="select('font')"
      >
        <font-awesome-icon :icon="['fas', 'font']" />
      </button>
      <button
        type="button"
        class="tool-button"
        :class="{ selected: selected === 'formula' }"
        :aria-pressed="selected === 'formula'"
        aria-label="Formula"
        title="Formula (F)"
        @click="select('formula')"
      >
        <font-awesome-icon :icon="['fas', 'square-root-alt']" />
      </button>

      <div
        class="tool-menu"
        @mouseenter="showShapesSubmenu = true"
        @mouseleave="showShapesSubmenu = false"
      >
        <button
          type="button"
          class="tool-button"
          :class="{ selected: selected === 'shapes' }"
          :aria-pressed="selected === 'shapes'"
          aria-label="Shapes"
          aria-haspopup="true"
          :aria-expanded="showShapesSubmenu && selected === 'shapes'"
          title="Shapes (S)"
          @click="select('shapes')"
        >
          <font-awesome-icon :icon="['fas', 'shapes']" />
        </button>

        <transition name="fade">
          <div
            v-if="showShapesSubmenu && selected === 'shapes'"
            class="shapes-submenu"
            role="group"
            aria-label="Shape options"
            @click.stop
          >
            <button
              type="button"
              class="submenu-button"
              :class="{ 'selected-shape': selectedShape === 'rectangle' }"
              :aria-pressed="selectedShape === 'rectangle'"
              aria-label="Rectangle"
              title="Rectangle (R)"
              @click="selectShape('rectangle')"
            >
              <font-awesome-icon :icon="['far', 'square']" />
            </button>
            <button
              type="button"
              class="submenu-button"
              :class="{ 'selected-shape': selectedShape === 'circle' }"
              :aria-pressed="selectedShape === 'circle'"
              aria-label="Circle"
              title="Circle (C)"
              @click="selectShape('circle')"
            >
              <font-awesome-icon :icon="['far', 'circle']" />
            </button>
            <button
              type="button"
              class="submenu-button line-icon"
              :class="{ 'selected-shape': selectedShape === 'arrow' }"
              :aria-pressed="selectedShape === 'arrow'"
              aria-label="Line"
              title="Line (L)"
              @click="selectShape('arrow')"
            >
              |
            </button>
          </div>
        </transition>
      </div>

      <div
        class="tool-menu"
        @mouseenter="showKitsSubmenu = true"
        @mouseleave="showKitsSubmenu = false"
      >
        <button
          type="button"
          class="tool-button"
          aria-label="Stamps"
          aria-haspopup="true"
          :aria-expanded="showKitsSubmenu"
          title="Stamps"
        >
          <font-awesome-icon :icon="['fas', 'wand-magic-sparkles']" />
        </button>
        <transition name="fade">
          <div
            v-if="showKitsSubmenu"
            class="shapes-submenu kits-submenu"
            role="group"
            aria-label="Stamp kits"
            @click.stop
          >
            <button
              v-for="kit in stampKits"
              :key="kit.id"
              type="button"
              class="submenu-button"
              :aria-label="kit.label"
              :title="kit.label"
              @click="insertKit(kit.id)"
            >
              <font-awesome-icon
                :icon="kit.id === 'unitCircle' ? ['fas', 'circle-notch'] : ['fas', 'border-all']"
              />
            </button>
          </div>
        </transition>
      </div>
    </div>

    <div
      class="color-panel"
      @mouseenter="showColorPopover = true"
      @mouseleave="showColorPopover = false"
      title="Pen color"
    >
      <span
        class="color-indicator"
        :class="{ white: isLightDisplayColor }"
        :style="{ background: displayColor }"
        role="img"
        aria-label="Pen color"
      ></span>

      <transition name="fade">
        <div
          v-if="showColorPopover"
          class="color-popover"
          role="group"
          aria-label="Pen colors"
          @click.stop
        >
          <button
            v-for="preset in colorPresets"
            :key="preset.id"
            type="button"
            class="swatch"
              :class="{
                selected: isPresetSelected(preset),
                white: (preset.id === 'main' && mainInkIsLight) || preset.id === 'yellow',
              }"
            :style="{ background: swatchColor(preset) }"
            :aria-label="preset.label"
            :title="`${preset.label} (${presetShortcut(preset)})`"
            :aria-pressed="isPresetSelected(preset)"
            @click="chooseColor(preset.value)"
          ></button>
        </div>
      </transition>
    </div>
    
    <div class="history-panel" role="toolbar" aria-label="History">
      <button
        type="button"
        class="history-button"
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        @click="$emit('undo')"
      >
        <font-awesome-icon :icon="['fas', 'undo']" />
      </button>
      <button
        type="button"
        class="history-button"
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
        @click="$emit('redo')"
      >
        <font-awesome-icon :icon="['fas', 'redo']" />
      </button>
    </div>
  </div>
</template>

<script>
import { COLOR_PRESETS } from '../config/colors.js'
import { listKits } from '../stamps/registry.js'

export default {
  name: "ToolsPanel",
  props: {
    selectedTool: {
      type: String,
      default: 'select'
    },
    selectedShape: {
      type: String,
      default: 'rectangle'
    },
    selectedColor: {
      type: String,
      default: null
    },
    displayColor: {
      type: String,
      default: '#000000'
    },
    mainColor: {
      type: String,
      default: '#000000'
    },
    mainInkIsLight: {
      type: Boolean,
      default: false
    }
  },
  emits: [
    'tool-selected',
    'shape-selected',
    'color-selected',
    'undo',
    'redo',
    'insert-kit',
  ],
  data() {
    return {
      selected: "select",
      showShapesSubmenu: false,
      showKitsSubmenu: false,
      showColorPopover: false,
      colorPresets: COLOR_PRESETS,
      stampKits: listKits(),
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
  computed: {
    isLightDisplayColor() {
      return this.selectedColor === null && this.mainInkIsLight;
    },
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
      this.$emit('shape-selected', shape);
    },
    insertKit(kitId) {
      this.$emit('insert-kit', kitId);
      this.showKitsSubmenu = false;
    },
    swatchColor(preset) {
      return preset.value ?? this.mainColor;
    },
    isPresetSelected(preset) {
      if (preset.value === null) return this.selectedColor === null;
      return this.selectedColor === preset.value;
    },
    chooseColor(value) {
      this.$emit('color-selected', value);
    },
    presetShortcut(preset) {
      const index = this.colorPresets.findIndex((entry) => entry.id === preset.id);
      return index >= 0 ? String(index + 1) : '';
    },
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
.left-chrome {
  position: absolute;
  z-index: 10;
  left: 12px;
  top: max(15vh, 100px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.tools-panel {
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

.tool-menu {
  position: relative;
}

.tool-button,
.history-button,
.submenu-button {
  appearance: none;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  color: var(--icon-color);
  font: inherit;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.tool-button:hover,
.history-button:hover,
.submenu-button:hover {
  background-color: var(--hover-bg);
  transform: translateY(-1px);
}

.tool-button:focus-visible,
.history-button:focus-visible,
.submenu-button:focus-visible {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
}

.tool-button.selected {
  background-color: var(--selected-bg);
  color: var(--selected-text);
  box-shadow: var(--selected-shadow);
}

.history-panel {
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

.submenu-button {
  padding: 6px 10px;
  border-radius: 5px;
}

.submenu-button.selected-shape {
  background-color: var(--selected-bg);
  color: var(--selected-text);
  box-shadow: var(--selected-shadow);
}

.submenu-button.line-icon {
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

.color-panel {
  position: relative;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--surface-primary);
  box-shadow: var(--panel-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.color-indicator {
  display: block;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
}

.color-indicator.white,
.swatch.white {
  border: 1px solid var(--border-color);
  box-sizing: border-box;
}

.color-popover {
  position: absolute;
  left: 100%;
  top: -2px;
  transform: none;
  margin-left: 10px;
  background: var(--surface-primary);
  border: none;
  border-radius: 8px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0;
  padding: 6px 4px;
  white-space: nowrap;
  box-shadow: var(--panel-shadow);
}

.swatch {
  width: 22px;
  height: 22px;
  margin: 6px 4px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.swatch.selected {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
}
</style>
