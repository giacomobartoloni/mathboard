;(function () {
  var PRODUCTION_HOSTS = { 'mathboard.app': true }
  var SCRIPT_ID = 'simple-analytics-script'
  var SCRIPT_SRC = 'https://scripts.simpleanalyticscdn.com/latest.js'

  function isAnalyticsEnabled() {
    return typeof window !== 'undefined' && Boolean(PRODUCTION_HOSTS[window.location.hostname])
  }

  function ensureEventQueue() {
    if (typeof window.sa_event === 'function') return
    window.sa_event = function saEventPlaceholder() {
      var args = Array.prototype.slice.call(arguments)
      if (window.sa_event.q) {
        window.sa_event.q.push(args)
      } else {
        window.sa_event.q = [args]
      }
    }
  }

  function loadAnalytics() {
    if (!isAnalyticsEnabled()) return
    if (document.getElementById(SCRIPT_ID)) return
    ensureEventQueue()
    window.sa_metadata = window.sa_metadata || { runtime: 'seo' }
    var script = document.createElement('script')
    script.id = SCRIPT_ID
    script.async = true
    script.src = SCRIPT_SRC
    document.head.appendChild(script)
  }

  function pageSlug() {
    var path = window.location.pathname || '/'
    return path.replace(/^\/+|\/+$/g, '') || 'home'
  }

  function trackCta(event) {
    var link = event.target.closest('[data-seo-cta="open-board"]')
    if (!link || !isAnalyticsEnabled()) return
    ensureEventQueue()
    try {
      window.sa_event('seo_cta_clicked', {
        page: pageSlug(),
        placement: link.getAttribute('data-placement') || 'unknown',
      })
    } catch (_) {
      /* analytics must never break the page */
    }
  }

  function setupCopyButtons() {
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-copy-latex]')
      if (!button) return
      var source = button.getAttribute('data-copy-latex') || ''
      if (!navigator.clipboard || !navigator.clipboard.writeText) return
      navigator.clipboard.writeText(source).then(function () {
        var original = button.textContent
        button.textContent = 'Copied'
        window.setTimeout(function () {
          button.textContent = original
        }, 1500)
      }).catch(function () {
        /* ignore */
      })
    })
  }

  loadAnalytics()
  document.addEventListener('click', trackCta)
  setupCopyButtons()
})()
