import test from 'node:test'
import assert from 'node:assert/strict'
import { publicSitePageUrl } from '../src/platform/siteLinks.js'

test('desktop resources and privacy pages resolve to public HTTPS pages', () => {
  assert.equal(publicSitePageUrl('/resources/'), 'https://mathboard.app/resources/')
  assert.equal(publicSitePageUrl('/download/'), 'https://mathboard.app/download/')
  assert.equal(publicSitePageUrl('/privacy-policy.html'), 'https://mathboard.app/privacy-policy.html')
})

test('public site page helper rejects paths outside its allowlist', () => {
  assert.throws(() => publicSitePageUrl('mailto:someone@example.com'), TypeError)
  assert.throws(() => publicSitePageUrl('//example.com/'), TypeError)
  assert.throws(() => publicSitePageUrl('/unrecognized/'), TypeError)
})
