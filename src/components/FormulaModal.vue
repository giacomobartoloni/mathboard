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
  <div v-if="isVisible" class="modal-overlay" @click="closeModal">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>Insert Formula (LaTeX)</h3>
        <button
          type="button"
          class="close-button"
          aria-label="Close formula editor"
          @click="closeModal"
        >&times;</button>
      </div>

      <div class="modal-body">
        <div class="input-section">
          <label for="latex-input">LaTeX Formula:</label>
          <textarea
            ref="latexInput"
            id="latex-input"
            v-model="latexInput"
            placeholder="E.g., E = mc^2, \frac{a}{b}, \sqrt{x}"
            rows="4"
            @input="updatePreview"
            @keydown.ctrl.enter.prevent="insertFormula"
            @keydown.meta.enter.prevent="insertFormula"
          ></textarea>

          <div class="latex-tools">
            <div class="quick-insert-section">
              <div class="tools-label">Quick insert</div>
              <div class="quick-insert-grid">
                <button
                  v-for="item in quickInsertItems"
                  :key="item.id"
                  type="button"
                  class="latex-symbol-btn"
                  :title="`${item.label} — ${item.preview}`"
                  :aria-label="item.ariaLabel"
                  @mousedown.prevent
                  @click="insertLatex(item)"
                >
                  <span
                    class="latex-symbol-preview"
                    v-html="renderSymbol(item.preview)"
                  ></span>
                </button>
              </div>
              <p class="tools-hint">
                Tip: select an expression before choosing √, fraction, parentheses, or |x|.
              </p>
            </div>

            <div class="symbol-palette">
              <div class="palette-tabs" role="tablist" aria-label="Symbol categories">
                <button
                  v-for="group in paletteGroups"
                  :key="group.id"
                  type="button"
                  role="tab"
                  class="palette-tab"
                  :class="{ active: activePaletteGroup === group.id }"
                  :aria-selected="activePaletteGroup === group.id"
                  @click="activePaletteGroup = group.id"
                >
                  {{ group.label }}
                </button>
              </div>

              <div
                class="palette-items"
                role="tabpanel"
                :aria-label="activePaletteLabel"
              >
                <button
                  v-for="item in activePaletteItems"
                  :key="item.id"
                  type="button"
                  class="latex-symbol-btn"
                  :title="`${item.label} — ${item.preview}`"
                  :aria-label="item.ariaLabel"
                  @mousedown.prevent
                  @click="insertLatex(item)"
                >
                  <span
                    class="latex-symbol-preview"
                    v-html="renderSymbol(item.preview)"
                  ></span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="preview-section">
          <label>Preview:</label>
          <div class="preview-box">
            <div v-if="renderError" class="error-message">{{ renderError }}</div>
            <div v-else-if="!latexInput.trim()" class="placeholder">Enter a formula above...</div>
            <div v-else v-html="previewHtml"></div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn-cancel" @click="closeModal">Cancel</button>
        <button
          type="button"
          class="btn-insert"
          @click="insertFormula"
          :disabled="!isValidFormula"
        >Insert</button>
      </div>
    </div>
  </div>
</template>

<script>
import katex from 'katex'
import 'katex/dist/katex.min.css'
import {
  CURSOR,
  SELECTION,
  QUICK_INSERT_ITEMS,
  LATEX_PALETTE_GROUPS
} from '../config/latexPalette.js'

export default {
  name: 'FormulaModal',
  props: {
    isVisible: {
      type: Boolean,
      default: false
    },
    initialLatex: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      latexInput: '',
      renderError: null,
      isValidFormula: false,
      previewHtml: '',
      activePaletteGroup: 'symbols',
      quickInsertItems: QUICK_INSERT_ITEMS,
      paletteGroups: LATEX_PALETTE_GROUPS
    }
  },
  computed: {
    activePaletteItems() {
      const group = this.paletteGroups.find(
        (entry) => entry.id === this.activePaletteGroup
      )
      return group ? group.items : []
    },
    activePaletteLabel() {
      const group = this.paletteGroups.find(
        (entry) => entry.id === this.activePaletteGroup
      )
      return group ? group.label : 'Symbols'
    }
  },
  methods: {
    renderSymbol(latex) {
      return katex.renderToString(latex, {
        displayMode: false,
        throwOnError: false,
        strict: false
      })
    },
    updatePreview() {
      this.renderError = null
      this.isValidFormula = false
      this.previewHtml = ''

      if (!this.latexInput.trim()) {
        return
      }

      try {
        this.previewHtml = katex.renderToString(this.latexInput, {
          displayMode: true,
          throwOnError: true,
          errorColor: '#cc0000',
          strict: false
        })

        this.isValidFormula = true
      } catch (error) {
        this.renderError = error.message
        this.isValidFormula = false
      }
    },
    insertLatex(item) {
      const input = this.$refs.latexInput
      const start = input?.selectionStart ?? this.latexInput.length
      const end = input?.selectionEnd ?? start
      const selectedText = this.latexInput.slice(start, end)

      let fragment =
        selectedText && item.selectionTemplate
          ? item.selectionTemplate
          : item.template

      fragment = fragment.replaceAll(SELECTION, selectedText)

      const cursorOffset = fragment.indexOf(CURSOR)

      fragment = fragment
        .replaceAll(CURSOR, '')
        .replaceAll(SELECTION, '')

      this.latexInput =
        this.latexInput.slice(0, start) +
        fragment +
        this.latexInput.slice(end)

      this.updatePreview()

      this.$nextTick(() => {
        const position =
          cursorOffset >= 0
            ? start + cursorOffset
            : start + fragment.length

        input?.focus()
        input?.setSelectionRange(position, position)
      })
    },
    insertFormula() {
      if (!this.isValidFormula) return

      const formulaData = {
        latex: this.latexInput,
        html: katex.renderToString(this.latexInput, {
          displayMode: true,
          throwOnError: false
        })
      }

      this.$emit('insert-formula', formulaData)

      this.closeModal()
    },
    closeModal() {
      this.latexInput = ''
      this.renderError = null
      this.isValidFormula = false
      this.previewHtml = ''
      this.activePaletteGroup = 'symbols'
      this.$emit('close')
    }
  },
  watch: {
    isVisible(newVal) {
      if (newVal) {
        this.$nextTick(() => {
          this.latexInput = this.initialLatex || ''
          this.activePaletteGroup = 'symbols'
          this.updatePreview()

          const input = this.$refs.latexInput
          input?.focus()
        })
      }
    },
    initialLatex(newVal) {
      if (this.isVisible) {
        this.latexInput = newVal || ''
        this.updatePreview()
      }
    }
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-content {
  background: var(--surface-secondary);
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-button:hover {
  background-color: var(--hover-bg);
  color: var(--text-primary);
}

.close-button:focus-visible {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.input-section {
  margin-bottom: 24px;
}

.input-section label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 14px;
}

textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  resize: vertical;
  transition: border-color 0.2s;
  box-sizing: border-box;
  background: var(--surface-muted);
  color: var(--text-primary);
}

textarea:focus {
  outline: none;
  border-color: #4a90e2;
}

.latex-tools {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tools-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.tools-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

.quick-insert-grid,
.palette-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.latex-symbol-btn {
  min-width: 44px;
  height: 40px;
  padding: 4px 10px;
  background: var(--surface-muted);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, border-color 0.15s, transform 0.1s;
}

.latex-symbol-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border-color);
}

.latex-symbol-btn:active {
  transform: translateY(1px);
}

.latex-symbol-btn:focus-visible {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}

.latex-symbol-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  pointer-events: none;
}

.latex-symbol-preview :deep(.katex) {
  font-size: 1em;
}

.symbol-palette {
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
}

.palette-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.palette-tab {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  border-radius: 6px 6px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.15s;
}

.palette-tab:hover {
  color: var(--text-secondary);
  background: var(--hover-bg);
}

.palette-tab.active {
  color: var(--text-primary);
  border-bottom-color: #4a90e2;
  background: var(--surface-muted);
}

.palette-tab:focus-visible {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}

.preview-section label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 14px;
}

.preview-box {
  min-height: 120px;
  padding: 20px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--surface-muted);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-x: auto;
}

.placeholder {
  color: var(--text-placeholder);
  font-style: italic;
  font-size: 14px;
}

.error-message {
  color: #cc0000;
  font-size: 13px;
  padding: 12px;
  background-color: #fff5f5;
  border-radius: 6px;
  border: 1px solid #ffcccc;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel,
.btn-insert {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--surface-muted);
  color: var(--text-secondary);
}

.btn-cancel:hover {
  background: var(--hover-bg);
}

.btn-insert {
  background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
  color: white;
}

.btn-insert:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 144, 226, 0.3);
}

.btn-insert:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-cancel:focus-visible,
.btn-insert:focus-visible {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}

@media (max-width: 600px) {
  .modal-content {
    max-width: 100%;
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding-left: 16px;
    padding-right: 16px;
  }

  .latex-symbol-btn {
    min-width: 40px;
    height: 36px;
  }
}
</style>
