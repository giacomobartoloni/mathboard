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
  <div class="support-panel">
    <button class="about-button" @click="showAbout = true" title="About">
      <font-awesome-icon :icon="['fas', 'info-circle']" />
      <span>About</span>
    </button>
    

    <!-- About Modal -->
    <div v-if="showAbout" class="modal-overlay" @click="showAbout = false">
      <div class="modal-content" @click.stop>
        <button class="close-button" @click="showAbout = false">✕</button>
        <h2>MathBoard</h2>
        <p class="version">Version {{ version }}</p>
        
        <div class="about-text">
          <p>
            <strong>MathBoard</strong> is a free and open-source interactive digital whiteboard designed for mathematical notation and drawings. 
            It combines freehand drawing with LaTeX formula support, allowing you to create, edit, and organize 
            mathematical content with ease.
          </p>
          <p>
            Specifically crafted for educators, students, and professionals, MathBoard aims to enhance the way mathematical ideas 
            are communicated and understood in both academic and professional settings.
          </p>
        </div>

        <div class="opensource-section">
          <p><font-awesome-icon :icon="['fas', 'code-branch']" /> <strong>Open Source</strong></p>
          <p>MathBoard is licensed under the <strong>GNU AGPL v3</strong>. The source code is freely available on GitHub. Contributions, issues, and suggestions are welcome!</p>
          <div class="contact-links">
            <a href="https://github.com/giacomobartoloni/mathboard" target="_blank" rel="noopener noreferrer">
              <font-awesome-icon :icon="['fab', 'github']" /> GitHub Repository
            </a>
          </div>
        </div>

        <div class="feedback-section">
          <p><strong>Get in touch</strong></p>
          <p>Send your feedback, suggestions, or bug reports:</p>
          <div class="contact-links">
            <a href="mailto:gbartoloni@proton.me">Email me</a>
            <a href="https://www.linkedin.com/in/giacomobartoloni/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          </div>
        </div>

        <div class="coffee-section">
          <p>If you find MathBoard useful, consider supporting the project:</p>
          <a href="https://www.buymeacoffee.com/gbartoloni" target="_blank" rel="noopener noreferrer" class="coffee-link">
            <img src="../assets/bmc.png" alt="Buy Me A Coffee" />
            <span>Buy me a coffee</span>
          </a>
        </div>

        <div class="legal-links">
          <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'
import packageInfo from '../../package.json'

export default {
  name: 'SupportPanel',
  setup() {
    const showAbout = ref(false)
    const version = packageInfo.version

    return {
      showAbout,
      version
    }
  }
}
</script>

<style scoped>
.support-panel {
  position: absolute;
  z-index: 10;
  right: 12px;
  bottom: 12px;
  
  background: var(--panel-bg);
  border-radius: 8px;
  padding: 8px 6px;
  box-shadow: var(--panel-shadow);
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 40px;
}

@media (max-width: 768px) {
  .support-panel {
    bottom: 25px;
  }
}

.about-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s ease;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--panel-icon-color);
}

.about-button:hover {
  background-color: var(--panel-hover-bg);
  transform: translateY(-1px);
}

.support-panel a {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--panel-icon-color);
  text-decoration: none;
  font-size: 14px;
}

.support-panel a img {
  width: 15px;
  height: auto;
}

.support-panel a span {
  white-space: nowrap;
}

.support-panel a:hover {
  background-color: var(--panel-hover-bg);
  transform: translateY(-1px);
  color: #FFDD00;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--about-modal-bg);
  border-radius: 12px;
  padding: 30px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  position: relative;
}

.close-button {
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--close-btn-color);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.close-button:hover {
  background-color: var(--close-btn-hover-bg);
  color: var(--modal-text);
}

.modal-content h2 {
  margin: 0 0 5px 0;
  color: var(--modal-text);
  font-size: 28px;
  font-family: 'Satisfy', cursive;
}

.version {
  margin: 0 0 20px 0;
  color: var(--zoom-level-color);
  font-size: 14px;
}

.about-text {
  margin-bottom: 25px;
  line-height: 1.6;
  color: var(--about-text-color);
  text-align: left;
}

.about-text p {
  margin: 0 0 15px 0;
}

.opensource-section {
  background: var(--about-section-bg);
  padding: 20px;
  border-radius: 8px;
  text-align: left;
  margin-top: 20px;
}

.opensource-section p {
  margin: 0 0 10px 0;
  color: var(--about-text-color);
}

.opensource-section p:last-of-type {
  margin-bottom: 0;
}

.feedback-section {
  background: var(--feedback-section-bg);
  padding: 20px;
  border-radius: 8px;
  text-align: left;
  margin-top: 20px;
}

.feedback-section p {
  margin: 0 0 10px 0;
  color: var(--about-text-color);
}

.feedback-section p:last-child {
  margin-bottom: 0;
}

.feedback-section a {
  color: #007bff;
  text-decoration: none;
  font-weight: 500;
}

.feedback-section a:hover {
  text-decoration: underline;
}

.contact-links {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.contact-links a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--contact-link-bg);
  border: 1px solid var(--contact-link-border);
  border-radius: 6px;
  color: #007bff;
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.contact-links a:hover {
  background: #007bff;
  color: white;
  border-color: #007bff;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 123, 255, 0.3);
  text-decoration: none;
}

.coffee-section {
  text-align: center;
  margin-top: 20px;
  padding: 20px;
  border-top: 1px solid var(--separator-color);
}

.coffee-section p {
  margin: 0 0 15px 0;
  color: var(--modal-label-color);
  font-size: 14px;
}

.coffee-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #FFDD00 0%, #FFC800 100%);
  border-radius: 8px;
  color: #333;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(255, 221, 0, 0.3);
}

.coffee-link img {
  width: 20px;
  height: auto;
}

.support-panel .coffee-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 221, 0, 0.4);
  color: #000;
}

.legal-links {
  text-align: center;
  padding: 15px 20px 0;
  margin-top: 15px;
  border-top: 1px solid var(--separator-color);
  font-size: 13px;
}

.legal-links a {
  color: var(--zoom-level-color);
  text-decoration: none;
  transition: color 0.2s ease;
}

.legal-links a:hover {
  color: #007bff;
  text-decoration: underline;
}

.legal-links .separator {
  margin: 0 10px;
  color: #ccc;
}
</style>
