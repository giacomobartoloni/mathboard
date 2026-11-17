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

import { readFileSync, writeFileSync } from 'node:fs'
const target = process.argv[2]
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const cargoPattern = /(^name = "mathboard"\r?\nversion = ")([^"]+)("$)/gm

function cargoVersion(source, file) {
  const matches = [...source.matchAll(cargoPattern)]
  if (matches.length !== 1) throw new Error('Expected one mathboard package in ' + file)
  return matches[0][2]
}

function replaceCargoVersion(source, version) {
  return source.replace(cargoPattern, (_match, before, _old, after) => before + version + after)
}

function setVersion(version) {
  const paths = ['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']
  const [npm, npmLock, cargoToml, cargoLock] = paths.map(path => readFileSync(new URL('../' + path, import.meta.url), 'utf8'))
  const pkg = JSON.parse(npm)
  const lock = JSON.parse(npmLock)
  if (pkg.name !== 'mathboard' || lock.name !== 'mathboard' || lock.packages?.['']?.name !== 'mathboard') {
    throw new Error('Unexpected npm root package name')
  }
  const versions = [pkg.version, lock.version, lock.packages[''].version,
    cargoVersion(cargoToml, paths[2]), cargoVersion(cargoLock, paths[3])]
  if (new Set(versions).size !== 1) {
    throw new Error('Versions are already inconsistent; fix them before bumping')
  }
  if (versions[0] === version) {
    console.log('Already at ' + version)
    return
  }

  pkg.version = version
  lock.version = version
  lock.packages[''].version = version
  const updated = [
    JSON.stringify(pkg, null, 2) + '\n',
    JSON.stringify(lock, null, 2) + '\n',
    replaceCargoVersion(cargoToml, version),
    replaceCargoVersion(cargoLock, version)
  ]
  paths.forEach((path, index) => writeFileSync(new URL('../' + path, import.meta.url), updated[index]))
  console.log('Updated MathBoard version to ' + version + ' in ' + paths.length + ' files')
}

if (process.argv.length !== 3 || !versionPattern.test(target)) {
  console.error('Usage: npm run version:set -- <major.minor.patch>')
  process.exitCode = 2
} else {
  try {
    setVersion(target)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
