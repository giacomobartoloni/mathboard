/*
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
*/

import { ORIGIN } from './structured-data.mjs'

const EXTRA_KNOWN_PATHS = new Set([
  '/',
  '/privacy-policy.html',
])

const ASSET_EXT = /\.(css|js|svg|png|jpe?g|webp|avif|ico|woff2?|ttf|map)$/i

/** Internal page links only (trailing slash routes or .html). Skips static assets. */
function collectInternalHrefs(html) {
  const hrefs = []
  const re = /href="(\/[^"#?]*)"/g
  let match
  while ((match = re.exec(html)) !== null) {
    const href = match[1]
    if (ASSET_EXT.test(href)) continue
    if (href.endsWith('/') || href.endsWith('.html') || href === '/') {
      hrefs.push(href)
    }
  }
  return hrefs
}

export function validatePages(pages) {
  const paths = new Set()
  const titles = new Set()
  const descriptions = new Set()
  const h1s = new Set()

  for (const page of pages) {
    if (!page.path?.startsWith('/') || !page.path.endsWith('/')) {
      throw new Error(`SEO path must use leading and trailing slash: ${page.path}`)
    }

    if (paths.has(page.path)) {
      throw new Error(`Duplicate SEO path: ${page.path}`)
    }
    paths.add(page.path)

    if (!page.title?.trim()) {
      throw new Error(`Missing title: ${page.path}`)
    }
    if (titles.has(page.title)) {
      throw new Error(`Duplicate title: ${page.title}`)
    }
    titles.add(page.title)

    if (!page.description?.trim()) {
      throw new Error(`Missing description: ${page.path}`)
    }
    if (descriptions.has(page.description)) {
      throw new Error(`Duplicate description: ${page.path}`)
    }
    descriptions.add(page.description)

    if (!page.h1?.trim()) {
      throw new Error(`Missing h1: ${page.path}`)
    }
    if (h1s.has(page.h1)) {
      throw new Error(`Duplicate h1: ${page.h1}`)
    }
    h1s.add(page.h1)

    if (!page.body?.trim()) {
      throw new Error(`Missing body: ${page.path}`)
    }

    const canonical = page.canonical || `${ORIGIN}${page.path}`
    if (canonical !== `${ORIGIN}${page.path}`) {
      throw new Error(`Canonical must match path for ${page.path}: ${canonical}`)
    }
  }

  const knownPaths = new Set([...EXTRA_KNOWN_PATHS, ...paths])
  for (const page of pages) {
    const hrefs = collectInternalHrefs(page.body)
    for (const href of hrefs) {
      if (!knownPaths.has(href)) {
        throw new Error(`Unknown internal link on ${page.path}: ${href}`)
      }
    }
  }

  return { paths: knownPaths }
}

export function validateRenderedHtml(page, html) {
  const h1Matches = html.match(/<h1[\s>]/g)
  if (!h1Matches || h1Matches.length !== 1) {
    throw new Error(`Expected exactly one <h1> on ${page.path}`)
  }
  if (!html.includes(`<title>`)) {
    throw new Error(`Missing <title> on ${page.path}`)
  }
  if (!html.includes('name="description"')) {
    throw new Error(`Missing meta description on ${page.path}`)
  }
  if (!html.includes(`rel="canonical"`)) {
    throw new Error(`Missing canonical on ${page.path}`)
  }
  if (html.includes('noindex')) {
    throw new Error(`Unexpected noindex on ${page.path}`)
  }
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length < 40) {
    throw new Error(`Body too thin on ${page.path}`)
  }
}

export { collectInternalHrefs }
