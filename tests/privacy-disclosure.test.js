/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

test('the application does not mount a non-functional cookie consent UI', () => {
  const app = source('../src/App.vue')
  assert.doesNotMatch(app, /CookieBanner/)
})

test('web analytics retains its canonical-host script and existing metrics', () => {
  const transport = source('../src/analytics/transports/web.js')
  const privacyPage = source('../public/privacy-policy.html')
  assert.match(transport, /scripts\.simpleanalyticscdn\.com\/latest\.js/)
  assert.match(privacyPage, /scripts\.simpleanalyticscdn\.com\/latest\.js/)
  assert.match(privacyPage, /mathboard\.app/)
  assert.doesNotMatch(transport, /mathboard_cookie_consent|data-ignore-metrics/)
  assert.doesNotMatch(privacyPage, /mathboard_cookie_consent|data-ignore-metrics/)
})

test('privacy policy covers web and native analytics, delivery and GDPR rights', () => {
  const policy = source('../public/privacy-policy.html')
  assert.match(policy, /Cloudflare/)
  assert.match(policy, /Installed desktop analytics/)
  assert.match(policy, /Simple Analytics/)
  assert.match(policy, /GDPR Rights/)
  assert.doesNotMatch(policy, /mathboard_cookie_consent|Cookie Consent:|cookie consent choices/i)
})
