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
        <button class="close-button" @click="closeModal">&times;</button>
      </div>
      
      <div class="modal-body">
        <div class="input-section">
          <label for="latex-input">LaTeX Formula:</label>
          <textarea 
            id="latex-input"
            v-model="latexInput"
            placeholder="E.g., E = mc^2, \frac{a}{b}, \sqrt{x}"
            rows="3"
            @input="updatePreview"
          ></textarea>
          <div class="examples">
            <span class="example-label">Examples:</span>
            <button class="example-btn" @click="setExample('E = mc^2')">E = mc²</button>
            <button class="example-btn" @click="setExample('\\frac{a}{b}')">Fraction</button>
            <button class="example-btn" @click="setExample('\\sqrt{x^2 + y^2}')">Square Root</button>
            <button class="example-btn" @click="setExample('\\int_{a}^{b} f(x)dx')">Integral</button>
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
        <button class="btn-cancel" @click="closeModal">Cancel</button>
        <button class="btn-insert" @click="insertFormula" :disabled="!isValidFormula">Insert</button>
      </div>
    </div>
  </div>
</template>

<script>
import katex from 'katex'
import 'katex/dist/katex.min.css'

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
      previewHtml: ''
    }
  },
  methods: {
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
    setExample(formula) {
      this.latexInput = formula
      this.updatePreview()
    },
    insertFormula() {
      if (!this.isValidFormula) return
      
      const formulaData = {
        latex: this.latexInput,
        html: katex.renderToString(this.latexInput, {
          displayMode: true,
          throwOnError: false
        })
      };
      
      console.log('FormulaModal emitting insert-formula:', formulaData);
      this.$emit('insert-formula', formulaData)
      
      this.closeModal()
    },
    closeModal() {
      this.latexInput = ''
      this.renderError = null
      this.isValidFormula = false
      this.previewHtml = ''
      this.$emit('close')
    }
  },
  watch: {
    isVisible(newVal) {
      if (newVal) {
        this.$nextTick(() => {
          if (this.initialLatex) {
            this.latexInput = this.initialLatex
          }
          this.updatePreview()
          const input = document.getElementById('latex-input')
          if (input) input.focus()
        })
      }
    },
    initialLatex(newVal) {
      if (newVal && this.isVisible) {
        this.latexInput = newVal
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
  background: var(--modal-bg);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--modal-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  color: var(--modal-text);
  font-size: 20px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--close-btn-color);
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
  background-color: var(--close-btn-hover-bg);
  color: var(--modal-text);
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
  color: var(--modal-label-color);
  font-size: 14px;
}

textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--modal-border);
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  resize: vertical;
  transition: border-color 0.2s;
  box-sizing: border-box;
  background: var(--modal-input-bg);
  color: var(--modal-text);
}

textarea:focus {
  outline: none;
  border-color: #4a90e2;
}

.examples {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.example-label {
  font-size: 12px;
  color: var(--modal-placeholder-color);
  margin-right: 4px;
}

.example-btn {
  padding: 6px 12px;
  background: var(--modal-example-bg);
  border: 1px solid var(--modal-example-border);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--modal-example-color);
}

.example-btn:hover {
  background: var(--panel-hover-bg);
  border-color: var(--modal-border);
}

.preview-section label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--modal-label-color);
  font-size: 14px;
}

.preview-box {
  min-height: 100px;
  padding: 20px;
  border: 2px solid var(--modal-border);
  border-radius: 8px;
  background-color: var(--modal-preview-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-x: auto;
}

.placeholder {
  color: var(--modal-placeholder-color);
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
  border-top: 1px solid var(--modal-border);
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
  background: var(--modal-example-bg);
  color: var(--modal-example-color);
}

.btn-cancel:hover {
  background: var(--panel-hover-bg);
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
</style>
