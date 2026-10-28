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

test('both web analytics entry points omit optional device/browser metrics', () => {
  const transport = source('../src/analytics/transports/web.js')
  const privacyPage = source('../public/privacy-policy.html')
  for (const metric of ['country', 'session', 'timeonpage', 'scrolled', 'useragent', 'screensize', 'viewportsize', 'language']) {
    assert.match(transport, new RegExp(metric))
    assert.match(privacyPage, new RegExp(metric))
  }
  assert.match(transport, /data-ignore-metrics/)
  assert.match(privacyPage, /data-ignore-metrics/)
})

test('privacy policy covers web and native analytics, technical requests and rights', () => {
  const policy = source('../public/privacy-policy.html')
  assert.match(policy, /Cloudflare/)
  assert.match(policy, /Installed desktop analytics/)
  assert.match(policy, /Simple Analytics/)
  assert.match(policy, /GDPR Rights/)
  assert.doesNotMatch(policy, /mathboard_cookie_consent|Cookie Consent:|cookie consent choices/i)
})
