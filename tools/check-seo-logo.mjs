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

/**
 * Visual/style check: SEO brand logo vs App.vue .logo.
 * Exit 0 only when computed styles and rendered size match.
 */
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4177

const COMPARE_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'color',
  'backgroundColor',
  'borderTopWidth',
  'borderTopStyle',
  'borderTopColor',
  'borderRadius',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'boxShadow',
  'transform',
  'display',
]

const APP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Satisfy&display=swap" rel="stylesheet">
  <style>
    /* Minimal App.vue shell context that affects .logo inheritance */
    body { margin: 0; background: #f9f9f9; }
    #app {
      font-family: Avenir, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-align: center;
      color: #2c3e50;
    }
    /* Copied verbatim from src/App.vue .logo */
    .logo {
      font-family: 'Satisfy', cursive;
      font-size: normal;
      color: whitesmoke;
      background-color: rgb(61, 61, 61);
      border-radius: 5px;
      padding: 5px 10px ;
      border: tan 3px solid;
      position: absolute;
      z-index: 10;
      left: 40px;
      top: 40px;
      display: -ms-flexbox;
      display: flex;
      -ms-flex-direction: row;
      flex-direction: row;
      z-index: 200;
      transform: scale(1.5);
      transform-origin: top left;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15),
                  0 2px 4px rgba(0, 0, 0, 0.1);
    }
  </style>
</head>
<body>
  <div id="app">
    <span class="logo" id="target">MathBoard</span>
  </div>
</body>
</html>`

async function startServer() {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.woff2': 'font/woff2',
    '.js': 'text/javascript; charset=utf-8',
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/app-logo.html') {
        res.writeHead(200, { 'Content-Type': mime['.html'] })
        res.end(APP_HTML)
        return
      }
      if (req.url === '/seo-logo.html') {
        const css = await fs.readFile(path.join(ROOT, 'public/seo/seo.css'), 'utf8')
        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>${css}</style>
</head>
<body style="margin:40px;background:#f9f9f9">
  <a href="/" class="brand" aria-label="MathBoard home">
    <span class="logo" id="target">MathBoard</span>
  </a>
</body>
</html>`
        res.writeHead(200, { 'Content-Type': mime['.html'] })
        res.end(html)
        return
      }
      const rel = req.url === '/' ? '/index.html' : req.url
      const filePath = path.join(ROOT, 'public', rel)
      const data = await fs.readFile(filePath)
      const ext = path.extname(filePath)
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
  return server
}

async function readLogo(page, url) {
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.evaluateHandle('document.fonts.ready')
  await page.waitForFunction(() => {
    const el = document.getElementById('target')
    const family = getComputedStyle(el).fontFamily
    return document.fonts.check('16px Satisfy') || family.includes('Satisfy')
  }, { timeout: 10000 })

  return page.evaluate((props) => {
    const el = document.getElementById('target')
    const style = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    const values = {}
    for (const prop of props) {
      values[prop] = style[prop]
    }
    return {
      values,
      fontFamily: style.fontFamily,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      text: el.textContent,
    }
  }, COMPARE_PROPS)
}

function normalizeShadow(value) {
  // Chromium may reorder shadow layers; compare as sorted tokens.
  return value
    .split(/,(?![^(]*\))/)
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .sort()
    .join(' | ')
}

function valuesMatch(appVal, seoVal, prop) {
  if (prop === 'boxShadow') {
    return normalizeShadow(appVal) === normalizeShadow(seoVal)
  }
  if (prop === 'transform') {
    // matrix equivalence for scale(1.5)
    const parse = (v) => {
      const m = v.match(/matrix\(([^)]+)\)/)
      if (!m) return v
      return m[1].split(',').map((n) => Number(n.trim()).toFixed(3)).join(',')
    }
    return parse(appVal) === parse(seoVal)
  }
  return appVal === seoVal
}

async function main() {
  const server = await startServer()
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  })
  const outDir = path.join(ROOT, 'dist', 'logo-check')
  await fs.mkdir(outDir, { recursive: true })

  try {
    const appPage = await browser.newPage()
    await appPage.setViewport({ width: 400, height: 200, deviceScaleFactor: 2 })
    const app = await readLogo(appPage, `http://127.0.0.1:${PORT}/app-logo.html`)
    await appPage.screenshot({ path: path.join(outDir, 'app-logo.png'), omitBackground: false })

    const seoPage = await browser.newPage()
    await seoPage.setViewport({ width: 400, height: 200, deviceScaleFactor: 2 })
    const seo = await readLogo(seoPage, `http://127.0.0.1:${PORT}/seo-logo.html`)
    await seoPage.screenshot({ path: path.join(outDir, 'seo-logo.png'), omitBackground: false })

    const failures = []

    if (app.text !== 'MathBoard' || seo.text !== 'MathBoard') {
      failures.push(`text mismatch: app=${app.text} seo=${seo.text}`)
    }
    if (!app.fontFamily.includes('Satisfy')) {
      failures.push(`app font not Satisfy: ${app.fontFamily}`)
    }
    if (!seo.fontFamily.includes('Satisfy')) {
      failures.push(`seo font not Satisfy: ${seo.fontFamily}`)
    }

    for (const prop of COMPARE_PROPS) {
      if (!valuesMatch(app.values[prop], seo.values[prop], prop)) {
        failures.push(
          `${prop}: app=${JSON.stringify(app.values[prop])} seo=${JSON.stringify(seo.values[prop])}`,
        )
      }
    }

    // getBoundingClientRect includes transform; sizes should match closely.
    if (Math.abs(app.width - seo.width) > 1 || Math.abs(app.height - seo.height) > 1) {
      failures.push(
        `rendered size: app=${app.width}x${app.height} seo=${seo.width}x${seo.height}`,
      )
    }

    console.log('App logo:', app)
    console.log('SEO logo:', seo)

    if (failures.length) {
      console.error('\nLOGO CHECK FAILED:')
      for (const failure of failures) console.error(`- ${failure}`)
      console.error(`Screenshots: ${outDir}`)
      process.exitCode = 1
      return
    }

    console.log('\nLOGO CHECK PASSED: SEO brand .logo matches App.vue .logo')
    console.log(`Screenshots: ${outDir}`)
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
