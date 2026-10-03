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

export function renderOpenBoardCTA({ placement = 'main' } = {}) {
  return `
    <a
      class="button button-primary"
      href="/"
      data-seo-cta="open-board"
      data-placement="${escapeHtml(placement)}"
    >Open MathBoard</a>
  `.trim()
}

export function renderHeader() {
  return `
    <header class="site-header">
      <a href="/" class="brand">MathBoard</a>
      <nav aria-label="Primary">
        <a href="/resources/">Resources</a>
        <a href="https://github.com/giacomobartoloni/mathboard">GitHub</a>
        ${renderOpenBoardCTA({ placement: 'header' })}
      </nav>
    </header>
  `.trim()
}

export function renderFooter() {
  return `
    <footer class="site-footer">
      <nav aria-label="Footer">
        <a href="/resources/">Resources</a>
        <a href="/docs/keyboard-shortcuts/">Keyboard shortcuts</a>
        <a href="/docs/latex/">LaTeX examples</a>
        <a href="/privacy-policy.html">Privacy Policy</a>
        <a href="https://github.com/giacomobartoloni/mathboard">GitHub</a>
      </nav>
      <p class="footer-note">MathBoard is free and open source under the GNU AGPL v3.</p>
    </footer>
  `.trim()
}

export function renderBreadcrumbs(crumbs = []) {
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
    <nav aria-label="Breadcrumb">
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
} = {}) {
  if (!src) return ''
  const loading = eager ? 'eager' : 'lazy'
  const captionHtml = caption
    ? `<figcaption>${escapeHtml(caption)}</figcaption>`
    : ''
  return `
    <figure class="screenshot">
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

export function renderResourceCard({ href, title, description }) {
  return `
    <a class="resource-card" href="${escapeHtml(href)}">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
    </a>
  `.trim()
}
