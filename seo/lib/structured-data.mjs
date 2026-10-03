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

export const ORIGIN = 'https://mathboard.app'

function embedJsonLd(value) {
  // Prevent </script> breakout while keeping valid JSON for crawlers.
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

export function absoluteUrl(path) {
  if (!path) return ORIGIN
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

function softwareApplication(page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MathBoard',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web Browser',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    description: page.description,
    url: absoluteUrl(page.path),
    author: {
      '@type': 'Person',
      name: 'Giacomo Bartoloni',
    },
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    codeRepository: 'https://github.com/giacomobartoloni/mathboard',
  }
}

function webPage(page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title,
    description: page.description,
    url: absoluteUrl(page.path),
    isPartOf: {
      '@type': 'WebSite',
      name: 'MathBoard',
      url: ORIGIN,
    },
  }
}

function breadcrumbList(page) {
  if (!Array.isArray(page.breadcrumbs) || page.breadcrumbs.length === 0) {
    return null
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: page.breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      ...(crumb.href ? { item: absoluteUrl(crumb.href) } : {}),
    })),
  }
}

export function renderStructuredData(page) {
  const blocks = []
  if (page.structuredData === 'software-application') {
    blocks.push(softwareApplication(page))
  } else if (page.structuredData === 'webpage' || page.structuredData === 'docs') {
    blocks.push(webPage(page))
  }
  const crumbs = breadcrumbList(page)
  if (crumbs) {
    blocks.push(crumbs)
  }
  return blocks
    .map(
      (block) =>
        `<script type="application/ld+json">${embedJsonLd(block)}</script>`,
    )
    .join('\n')
}
