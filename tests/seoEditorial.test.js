/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { render404, renderLayout } from '../seo/lib/render-layout.mjs'
import { validateRenderedHtml } from '../seo/lib/validate-pages.mjs'
import download from '../seo/pages/download.mjs'
import macos from '../seo/pages/download-macos.mjs'
import windows from '../seo/pages/download-windows.mjs'
import linux from '../seo/pages/download-linux.mjs'
import security from '../seo/pages/download-security.mjs'
import resources from '../seo/pages/resources.mjs'
import overview from '../seo/pages/math-whiteboard.mjs'
import latexWhiteboard from '../seo/pages/latex-whiteboard.mjs'
import openSource from '../seo/pages/open-source-math-whiteboard.mjs'
import shortcuts from '../seo/pages/keyboard-shortcuts.mjs'
import latexDocs from '../seo/pages/latex-docs.mjs'

const pages = [
  download, macos, windows, linux, security,
  resources, overview, latexWhiteboard, openSource,
  shortcuts, latexDocs,
]

const editorialHeroes = [resources, overview, latexWhiteboard, openSource]
const readingPages = [macos, windows, linux, security, shortcuts, latexDocs]

test('every generated static page retains one semantically correct heading and structured data', () => {
  for (const page of pages) {
    const html = renderLayout(page)
    assert.doesNotThrow(() => validateRenderedHtml(page, html), page.path)
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, page.path)
    assert.ok(html.includes(page.h1), page.path)
    assert.ok(html.includes('rel="canonical"'), page.path)
  }
})

test('editorial overview pages have the only h1 inside a dark hero', () => {
  for (const page of editorialHeroes) {
    assert.equal(page.h1InBody, true, page.path)
    const html = renderLayout(page)
    assert.match(html, /<div class="site-hero(?: site-hero--with-art)?">[\s\S]*?<h1>/)
    assert.ok(html.includes('class="editorial-eyebrow"'), page.path)
    assert.ok(html.includes('data-seo-cta="open-board"'), page.path)
  }
})

test('guides, reference documents, privacy and 404 keep readable editorial structure', () => {
  for (const page of readingPages) {
    assert.equal(page.h1InBody, undefined, page.path)
    const html = renderLayout(page)
    assert.ok(html.includes('class="reading-intro"'), page.path)
    assert.ok(html.includes('<h1>'), page.path)
  }

  const privacy = readFileSync(new URL('../public/privacy-policy.html', import.meta.url), 'utf8')
  assert.ok(privacy.includes('class="reading-intro privacy-heading"'))
  assert.ok(privacy.includes('Last updated: October 1, 2026'))
  assert.ok(privacy.includes("script.id = 'simple-analytics-script'"))
  const notFound = render404()
  assert.ok(notFound.includes('class="not-found"'))
  assert.equal((notFound.match(/<h1(?:\s|>)/g) || []).length, 1)
})

test('shared editorial styles retain accessible contrast, reduced motion and practical content', () => {
  const css = readFileSync(new URL('../public/seo/seo.css', import.meta.url), 'utf8')
  assert.ok(css.includes('Shared chalkboard/editorial language'))
  assert.ok(css.includes('.site-hero h1'))
  assert.ok(css.includes('.reading-intro::before'))
  assert.ok(css.includes('.resource-group > h2::before'))
  assert.ok(css.includes('.site-hero a:focus-visible'))
  assert.ok(css.includes('.site-footer a:focus-visible'))
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'))
  assert.ok(css.includes('.table-wrap'))
  assert.ok(css.includes('.formula-example'))
  assert.ok(css.includes('.download-option'))
  assert.ok(css.includes('.privacy-content'))
  assert.ok(css.includes('.not-found'))
})
