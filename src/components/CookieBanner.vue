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
  <transition name="slide-up">
    <div v-if="showBanner" class="cookie-banner">
      <div class="cookie-content">
        <div class="cookie-icon">🍪</div>
        <div class="cookie-text">
          <h3>Cookie Policy</h3>
          <p>
            We use essential cookies to ensure the proper functioning of MathBoard. 
            These cookies store your preferences and session data locally. 
            We do not use tracking or advertising cookies.
            <button class="learn-more-link" @click="showDetails = !showDetails">
              {{ showDetails ? 'Show less' : 'Learn more' }}
            </button>
          </p>
          
          <div v-if="showDetails" class="cookie-details">
            <p><strong>Essential cookies:</strong></p>
            <ul>
              <li>Session storage for your drawing board state</li>
              <li>User preferences (zoom level, tool selection)</li>
              <li>Cookie consent preference</li>
            </ul>
            <p>
              By clicking "Accept", you consent to our use of essential cookies. 
              For more information, read our 
              <a href="/privacy-policy.html" target="_blank">Privacy Policy</a>.
            </p>
          </div>
        </div>
        
        <div class="cookie-actions">
          <button class="btn btn-accept" @click="acceptCookies">
            Accept All
          </button>
          <button class="btn btn-essential" @click="acceptEssentialOnly">
            Essential Only
          </button>
          <button class="btn btn-reject" @click="rejectCookies">
            Reject All
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
import { ref, onMounted } from 'vue'

export default {
  name: 'CookieBanner',
  setup() {
    const showBanner = ref(false)
    const showDetails = ref(false)
    const COOKIE_CONSENT_KEY = 'mathboard_cookie_consent'

    const checkConsent = () => {
      const consent = localStorage.getItem(COOKIE_CONSENT_KEY)
      if (!consent) {
        // Show banner after a short delay for better UX
        setTimeout(() => {
          showBanner.value = true
        }, 1000)
      }
    }

    const acceptCookies = () => {
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString()
      }))
      showBanner.value = false
    }

    const acceptEssentialOnly = () => {
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString()
      }))
      showBanner.value = false
    }

    const rejectCookies = () => {
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
        essential: false,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString()
      }))
      showBanner.value = false
    }

    onMounted(() => {
      checkConsent()
    })

    return {
      showBanner,
      showDetails,
      acceptCookies,
      acceptEssentialOnly,
      rejectCookies
    }
  }
}
</script>

<style scoped>
.cookie-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--cookie-bg);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  border-top: 3px solid var(--cookie-border-top);
}

.cookie-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 32px;
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
}

.cookie-icon {
  font-size: 36px;
  flex-shrink: 0;
}

.cookie-text {
  flex: 1;
  min-width: 300px;
}

.cookie-text h3 {
  margin: 0 0 8px 0;
  color: var(--cookie-heading);
  font-size: 20px;
  font-weight: 600;
}

.cookie-text p {
  margin: 0 0 8px 0;
  color: var(--cookie-text);
  line-height: 1.6;
  font-size: 14px;
}

.learn-more-link {
  background: none;
  border: none;
  color: #007bff;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font-size: 14px;
  margin-left: 4px;
}

.learn-more-link:hover {
  color: #0056b3;
}

.cookie-details {
  margin-top: 12px;
  padding: 12px;
  background: var(--cookie-details-bg);
  border-radius: 6px;
  font-size: 13px;
}

.cookie-details ul {
  margin: 8px 0;
  padding-left: 20px;
}

.cookie-details li {
  margin: 4px 0;
  color: var(--cookie-text);
}

.cookie-details a {
  color: #007bff;
  text-decoration: none;
}

.cookie-details a:hover {
  text-decoration: underline;
}

.cookie-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-accept {
  background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}

.btn-accept:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
}

.btn-essential {
  background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(0, 123, 255, 0.3);
}

.btn-essential:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.4);
}

.btn-reject {
  background: linear-gradient(135deg, #6c757d 0%, #5a6268 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(108, 117, 125, 0.3);
}

.btn-reject:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(108, 117, 125, 0.4);
}

/* Responsive */
@media (max-width: 768px) {
  .cookie-content {
    padding: 20px;
    flex-direction: column;
    align-items: stretch;
  }
  
  .cookie-icon {
    font-size: 28px;
  }
  
  .cookie-text {
    min-width: unset;
  }
  
  .cookie-actions {
    flex-direction: column;
    width: 100%;
  }
  
  .btn {
    width: 100%;
  }
}

/* Transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
