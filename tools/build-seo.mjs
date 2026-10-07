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

import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import resources from '../seo/pages/resources.mjs'
import mathWhiteboard from '../seo/pages/math-whiteboard.mjs'
import latexWhiteboard from '../seo/pages/latex-whiteboard.mjs'
import openSource from '../seo/pages/open-source-math-whiteboard.mjs'
import shortcuts from '../seo/pages/keyboard-shortcuts.mjs'
import latexDocs from '../seo/pages/latex-docs.mjs'
import { render404, renderLayout } from '../seo/lib/render-layout.mjs'
import {
  collectInternalHrefs,
  validatePages,
  validateRenderedHtml,
} from '../seo/lib/validate-pages.mjs'
import {
  ORIGIN,
  SOFTWARE_ID,
  assertSoftwareEntityParity,
} from '../seo/lib/structured-data.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const require = createRequire(import.meta.url)

const pages = [
  resources,
  mathWhiteboard,
  latexWhiteboard,
  openSource,
  shortcuts,
  latexDocs,
]

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function copyKatexAssets() {
  const katexPkg = path.dirname(require.resolve('katex/package.json'))
  const katexDist = path.join(katexPkg, 'dist')
  const outDir = path.join(DIST, 'seo', 'katex')
  await fs.mkdir(outDir, { recursive: true })
  await fs.copyFile(
    path.join(katexDist, 'katex.min.css'),
    path.join(outDir, 'katex.min.css'),
  )
  await fs.cp(path.join(katexDist, 'fonts'), path.join(outDir, 'fonts'), {
    recursive: true,
  })
}

function renderSitemap(urls) {
  const unique = [...new Set(urls)]
  if (unique.length !== urls.length) {
    throw new Error('Duplicate URLs in sitemap')
  }
  const entries = unique
    .map(
      (loc) => `  <url>
    <loc>${loc}</loc>
  </url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`
}

async function main() {
  if (!(await pathExists(DIST))) {
    throw new Error('dist/ is missing. Run vite build (npm run build:app) first.')
  }

  const { paths: knownPaths } = validatePages(pages)
  const needsKatex = pages.some((page) => page.needsKatex)
  if (needsKatex) {
    await copyKatexAssets()
  }

  console.log('SEO build')
  const writtenPaths = []

  for (const page of pages) {
    const html = renderLayout(page)
    validateRenderedHtml(page, html)

    for (const href of collectInternalHrefs(html)) {
      if (!knownPaths.has(href)) {
        throw new Error(`Unknown internal link in rendered ${page.path}: ${href}`)
      }
    }

    const relative = page.path.replace(/^\//, '').replace(/\/$/, '')
    const dir = path.join(DIST, relative)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8')
    writtenPaths.push(page.path)
    console.log(`✓ ${page.path}`)
  }

  const sitemapUrls = [`${ORIGIN}/`, ...pages.map((page) => `${ORIGIN}${page.path}`)]
  await fs.writeFile(path.join(DIST, 'sitemap.xml'), renderSitemap(sitemapUrls), 'utf8')
  console.log(`✓ sitemap.xml (${sitemapUrls.length} URLs including /)`)

  await fs.writeFile(path.join(DIST, '404.html'), render404(), 'utf8')
  console.log('✓ 404.html')

  const rootHtml = await fs.readFile(path.join(DIST, 'index.html'), 'utf8')
  const rootLdMatch = rootHtml.match(
    /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  )
  if (!rootLdMatch) {
    throw new Error('Missing JSON-LD on /')
  }
  let rootLd
  try {
    rootLd = JSON.parse(rootLdMatch[1])
  } catch (error) {
    throw new Error(`Invalid JSON-LD on /: ${error.message}`)
  }
  assertSoftwareEntityParity(rootLd)
  console.log(`✓ root structured data (${SOFTWARE_ID})`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
