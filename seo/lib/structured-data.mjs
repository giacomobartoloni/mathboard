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

import assert from 'node:assert/strict'

export const ORIGIN = 'https://mathboard.app'
export const SCHEMA_CONTEXT = 'https://schema.org'
export const SOFTWARE_ID = `${ORIGIN}/#software`
export const WEBSITE_ID = `${ORIGIN}/#website`

export function assertSchemaContext(document, label = 'JSON-LD') {
  if (document?.['@context'] !== SCHEMA_CONTEXT) {
    throw new Error(`${label} must use @context ${SCHEMA_CONTEXT}`)
  }
}

const SOFTWARE_DESCRIPTION =
  'Free browser-based math whiteboard with freehand drawing, text, shapes, and editable LaTeX formulas.'

function embedJsonLd(value) {
  // Prevent </script> breakout while keeping valid JSON for crawlers.
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

export function absoluteUrl(path) {
  if (!path) return ORIGIN
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

function mathboardWebsite() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: 'MathBoard',
    url: `${ORIGIN}/`,
  }
}

/** Fresh canonical MathBoard software entity for SEO graphs and root parity. */
export function buildMathboardSoftwareEntity() {
  return {
    '@type': ['SoftwareApplication', 'WebApplication'],
    '@id': SOFTWARE_ID,
    name: 'MathBoard',
    url: `${ORIGIN}/`,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web Browser',
    description: SOFTWARE_DESCRIPTION,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    author: {
      '@type': 'Person',
      name: 'Giacomo Bartoloni',
    },
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    codeRepository: 'https://github.com/giacomobartoloni/mathboard',
  }
}

function normalizedTypes(value) {
  return [...new Set(Array.isArray(value) ? value : [value])].sort()
}

/** Invariant fields used for root ↔ canonical software parity. */
export function softwareComparable(node) {
  return {
    '@type': normalizedTypes(node['@type']),
    '@id': node['@id'],
    name: node.name,
    url: node.url,
    description: node.description,
    applicationCategory: node.applicationCategory,
    operatingSystem: node.operatingSystem,
    offers: node.offers,
    author: node.author,
    license: node.license,
    codeRepository: node.codeRepository,
  }
}

export function assertSoftwareEntityParity(
  actual,
  expected = buildMathboardSoftwareEntity(),
) {
  assert.deepStrictEqual(
    softwareComparable(actual),
    softwareComparable(expected),
    'Root structured data does not match canonical MathBoard software entity',
  )
}

function webPage(page, { aboutSoftware = false } = {}) {
  return {
    '@type': 'WebPage',
    '@id': `${absoluteUrl(page.path)}#webpage`,
    name: page.title,
    description: page.description,
    url: absoluteUrl(page.path),
    isPartOf: {
      '@id': WEBSITE_ID,
    },
    ...(aboutSoftware
      ? {
          about: {
            '@id': SOFTWARE_ID,
          },
        }
      : {}),
  }
}

function breadcrumbList(page) {
  if (!Array.isArray(page.breadcrumbs) || page.breadcrumbs.length === 0) {
    return null
  }
  return {
    '@type': 'BreadcrumbList',
    '@id': `${absoluteUrl(page.path)}#breadcrumb`,
    itemListElement: page.breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      ...(crumb.href ? { item: absoluteUrl(crumb.href) } : {}),
    })),
  }
}

export function renderStructuredData(page) {
  const graph = [mathboardWebsite()]
  const isSoftwarePage = page.structuredData === 'software-application'
  const aboutSoftware = isSoftwarePage || page.aboutSoftware === true

  if (isSoftwarePage || aboutSoftware) {
    graph.push(buildMathboardSoftwareEntity())
  }

  if (
    isSoftwarePage
    || page.structuredData === 'webpage'
    || page.structuredData === 'docs'
  ) {
    graph.push(webPage(page, { aboutSoftware }))
  }

  const crumbs = breadcrumbList(page)
  if (crumbs) {
    graph.push(crumbs)
  }

  return `<script type="application/ld+json">${embedJsonLd({
    '@context': SCHEMA_CONTEXT,
    '@graph': graph,
  })}</script>`
}
