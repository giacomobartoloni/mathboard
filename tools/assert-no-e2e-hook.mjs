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
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FORBIDDEN_MARKERS = [
  '__MATHBOARD_E2E__',
  'MATHBOARD_E2E_INSTRUMENTATION_V1',
  '_e2eObjectType',
  '_e2eSnapshotObject',
  'getE2eState',
  'installE2eHook',
  'uninstallE2eHook',
  'installBoardE2eHook',
]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')

async function collectAssetFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectAssetFiles(full))
    } else if (entry.isFile() && /\.(js|mjs|cjs|html)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

async function main() {
  let files
  try {
    files = await collectAssetFiles(distDir)
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`assert-no-e2e-hook: missing ${distDir}; run npm run build first`)
      process.exit(1)
    }
    throw err
  }

  const hits = []
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8')
    for (const marker of FORBIDDEN_MARKERS) {
      if (text.includes(marker)) {
        hits.push({ file: path.relative(root, file), marker })
      }
    }
  }

  if (hits.length) {
    console.error('production E2E leakage detected:')
    for (const hit of hits) {
      console.error(`  ${hit.file}`)
      console.error(`  marker: ${hit.marker}`)
    }
    process.exit(1)
  }

  console.log(`assert-no-e2e-hook: ok (${files.length} files scanned under dist/)`)
}

main()
