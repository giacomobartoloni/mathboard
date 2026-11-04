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

export function renderOpenBoardCTA({ placement = 'main', label = 'Open MathBoard' } = {}) {
  return `
    <a
      class="button button-primary"
      href="/"
      data-seo-cta="open-board"
      data-placement="${escapeHtml(placement)}"
    >${escapeHtml(label)}</a>
  `.trim()
}

export function renderHeader(ui = {}) {
  return `
    <header class="site-header">
      <a href="/" class="brand" aria-label="MathBoard home">
        <span class="logo">MathBoard</span>
      </a>
      <nav aria-label="${escapeHtml(ui.primary || 'Primary')}">
        <a href="/resources/">${escapeHtml(ui.resources || 'Resources')}</a>
        <a href="/download/">${escapeHtml(ui.download || 'Download')}</a>
        <a href="https://github.com/giacomobartoloni/mathboard">GitHub</a>
        ${renderOpenBoardCTA({ placement: 'header', label: ui.openBoard || 'Open MathBoard' })}
      </nav>
    </header>
  `.trim()
}

export function renderFooter(ui = {}) {
  return `
    <footer class="site-footer">
      <nav aria-label="${escapeHtml(ui.footer || 'Footer')}">
        <a href="/resources/">${escapeHtml(ui.resources || 'Resources')}</a>
        <a href="/download/">${escapeHtml(ui.downloads || 'Desktop downloads')}</a>
        <a href="/docs/keyboard-shortcuts/">${escapeHtml(ui.shortcuts || 'Keyboard shortcuts')}</a>
        <a href="/docs/latex/">${escapeHtml(ui.latex || 'LaTeX examples')}</a>
        <a href="/privacy-policy.html">${escapeHtml(ui.privacy || 'Privacy Policy')}</a>
        <a href="https://github.com/giacomobartoloni/mathboard">GitHub</a>
      </nav>
      <p class="footer-note">${escapeHtml(ui.footerNote || 'MathBoard is free and open source under the GNU AGPL v3.')}</p>
    </footer>
  `.trim()
}

export function renderBreadcrumbs(crumbs = [], label = 'Breadcrumb') {
  if (!Array.isArray(crumbs) || crumbs.length === 0) return ''
  const items = crumbs
    .map((crumb, index) => {
      const isLast = index === crumbs.length - 1
      if (isLast || !crumb.href) {
        return `<li aria-current="page">${escapeHtml(crumb.label)}</li>`
      }
      return `<li><a href="${escapeHtml(crumb.href)}">${escapeHtml(crumb.label)}</a></li>`
    })
    .join('\n')
  return `
    <nav aria-label="${escapeHtml(label)}">
      <ol class="breadcrumbs">
        ${items}
      </ol>
    </nav>
  `.trim()
}

export function renderScreenshot({
  src,
  alt,
  width = 1280,
  height = 720,
  eager = false,
  caption = '',
  className = '',
} = {}) {
  if (!src) return ''
  const loading = eager ? 'eager' : 'lazy'
  const classes = className ? `screenshot ${className}` : 'screenshot'
  const captionHtml = caption
    ? `<figcaption>${escapeHtml(caption)}</figcaption>`
    : ''
  return `
    <figure class="${classes}">
      <img
        src="${escapeHtml(src)}"
        width="${width}"
        height="${height}"
        alt="${escapeHtml(alt)}"
        loading="${loading}"
        decoding="async"
      >
      ${captionHtml}
    </figure>
  `.trim()
}

export function renderResourceCard({ href, title, description, headingLevel = 2 }) {
  const headingTag = headingLevel === 3 ? 'h3' : 'h2'
  return `
    <a class="resource-card" href="${escapeHtml(href)}">
      <${headingTag}>${escapeHtml(title)}</${headingTag}>
      <p>${escapeHtml(description)}</p>
    </a>
  `.trim()
}
