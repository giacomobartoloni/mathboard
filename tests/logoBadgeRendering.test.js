/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const seo = readFileSync(new URL('../public/seo/site.css', import.meta.url), 'utf8')

function logoRule(css, selector) {
  const start = css.indexOf(selector)
  assert.ok(start >= 0, `Missing ${selector} CSS rule`)
  const end = css.indexOf('}', start)
  assert.ok(end > start, `Unclosed ${selector} CSS rule`)
  return css.slice(start, end)
}

test('App and SEO logos render at native size without transform scaling', () => {
  const rules = [logoRule(app, '\n.logo {'), logoRule(seo, '\n.brand .logo {')]
  for (const rule of rules) {
    assert.match(rule, /font-size:\s*24px;/)
    assert.match(rule, /padding:\s*8px 15px;/)
    assert.match(rule, /border:\s*tan 4px solid;/)
    assert.doesNotMatch(rule, /transform:\s*scale\(/)
  }
})
