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


function renderLanguageLinks(page) {
  if (!page.alternates?.length) return ''
  const heading = escapeHtml(page.ui?.languages || 'Other languages')
  const links = page.alternates.map(({ path, label }) => {
    const current = page.path === path ? ' aria-current="page"' : ''
    return '<li><a href="' + escapeHtml(path) + '"' + current + '>' + escapeHtml(label) + '</a></li>'
  }).join('\n')
  return '<section class="language-links"><h2>' + heading + '</h2>'
    + '<nav aria-label="' + heading + '"><ul>' + links + '</ul></nav></section>'
}

function renderHreflang(page) {
  if (!page.alternates?.length) return ''
  const entries = [...page.alternates, { lang: 'x-default', path: '/math-whiteboard/' }]
  return entries.map(({ lang, path }) =>
    '<link rel="alternate" hreflang="' + escapeHtml(lang) + '" href="' +
    escapeHtml(ORIGIN + path) + '">'
  ).join('\n')
}

export function renderLayout(page) {
  const canonical = page.canonical || `${ORIGIN}${page.path}`
  const ogImage = absoluteUrl(page.ogImage || '/og-image.png')
  const title = escapeHtml(page.title)
  const description = escapeHtml(page.description)
  const h1 = escapeHtml(page.h1)
  // Only pages that render an in-body heading opt out of the shared h1 slot.
  const heading = page.h1InBody ? '' : `<h1>${h1}</h1>`
  const ui = page.ui || {}
  const breadcrumbs = renderBreadcrumbs(page.breadcrumbs, ui.breadcrumb || 'Breadcrumb')
  const hreflang = renderHreflang(page)
  const languageLinks = renderLanguageLinks(page)
  const katexCss = page.needsKatex
    ? '<link rel="stylesheet" href="/seo/katex/katex.min.css">'
    : ''

  return `<!doctype html>
<html lang="${escapeHtml(page.locale || 'en')}"${page.dir ? ` dir="${escapeHtml(page.dir)}"` : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  ${hreflang}

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
  <link rel="stylesheet" href="/seo/site.css">
  ${katexCss}

  ${renderStructuredData(page)}
</head>
<body>
  <a class="skip-link" href="#main">${escapeHtml(ui.skip || 'Skip to content')}</a>

  ${renderHeader(ui)}

  <main id="main">
    ${breadcrumbs}
    ${heading}
    ${page.body}
    ${languageLinks}
  </main>

  ${renderFooter(ui)}

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
  <link rel="stylesheet" href="/seo/site.css">
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
