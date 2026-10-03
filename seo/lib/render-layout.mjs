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

import { escapeHtml } from './escape-html.mjs'
import { renderBreadcrumbs, renderFooter, renderHeader } from './render-components.mjs'
import { absoluteUrl, ORIGIN, renderStructuredData } from './structured-data.mjs'

export function renderLayout(page) {
  const canonical = page.canonical || `${ORIGIN}${page.path}`
  const ogImage = absoluteUrl(page.ogImage || '/og-image.png')
  const title = escapeHtml(page.title)
  const description = escapeHtml(page.description)
  const h1 = escapeHtml(page.h1)
  const breadcrumbs = renderBreadcrumbs(page.breadcrumbs)
  const katexCss = page.needsKatex
    ? '<link rel="stylesheet" href="/seo/katex/katex.min.css">'
    : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${escapeHtml(canonical)}">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MathBoard">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">

  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/seo/seo.css">
  ${katexCss}

  ${renderStructuredData(page)}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  ${renderHeader()}

  <main id="main">
    ${breadcrumbs}
    <h1>${h1}</h1>
    ${page.body}
  </main>

  ${renderFooter()}

  <script src="/seo/seo.js" defer></script>
</body>
</html>
`
}

export function render404() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page not found — MathBoard</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/seo/seo.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  ${renderHeader()}
  <main id="main" class="not-found">
    <h1>Page not found</h1>
    <p>The URL does not exist.</p>
    <p class="cta-row">
      <a class="button button-primary" href="/">Open MathBoard</a>
      <a class="button" href="/resources/">Resources</a>
    </p>
  </main>
  ${renderFooter()}
</body>
</html>
`
}
