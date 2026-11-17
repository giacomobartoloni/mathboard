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

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../tools/set-version.mjs', import.meta.url))

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mathboard-version-'))
  mkdirSync(join(root, 'tools'))
  mkdirSync(join(root, 'src-tauri'))
  copyFileSync(script, join(root, 'tools/set-version.mjs'))
  writeFileSync(join(root, 'package.json'), '{"name":"mathboard","version":"1.14.0"}\n')
  writeFileSync(join(root, 'package-lock.json'), '{"name":"mathboard","version":"1.14.0","packages":{"":{"name":"mathboard","version":"1.14.0"},"node_modules/example":{"version":"1.14.0"}}}\n')
  writeFileSync(join(root, 'src-tauri/Cargo.toml'), '[package]\nname = "mathboard"\nversion = "1.14.0"\n')
  writeFileSync(join(root, 'src-tauri/Cargo.lock'), '[[package]]\nname = "mathboard"\nversion = "1.14.0"\n\n[[package]]\nname = "other"\nversion = "1.14.0"\n')
  return root
}

function run(root, ...args) {
  return spawnSync(process.execPath, [join(root, 'tools/set-version.mjs'), ...args], { encoding: 'utf8' })
}

function contents(root) {
  return ['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']
    .map(path => readFileSync(join(root, path), 'utf8'))
}

test('sets both npm and Cargo root versions without changing dependency versions', () => {
  const root = fixture()
  try {
    const result = run(root, '1.15.0')
    assert.equal(result.status, 0, result.stderr)
    const [npm, lock, manifest, cargoLock] = contents(root)
    assert.equal(JSON.parse(npm).version, '1.15.0')
    assert.equal(JSON.parse(lock).version, '1.15.0')
    assert.equal(JSON.parse(lock).packages[''].version, '1.15.0')
    assert.equal(JSON.parse(lock).packages['node_modules/example'].version, '1.14.0')
    assert.match(manifest, /^version = "1.15.0"$/m)
    assert.match(cargoLock, /name = "mathboard"\nversion = "1.15.0"/)
    assert.match(cargoLock, /name = "other"\nversion = "1.14.0"/)
    const snapshot = contents(root)
    assert.equal(run(root, '1.15.0').status, 0)
    assert.deepEqual(contents(root), snapshot)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects invalid versions without changing any files', () => {
  const root = fixture()
  try {
    const before = contents(root)
    for (const invalid of ['v1.15.0', '1.15', '1.15.0-beta', '01.15.0']) {
      assert.equal(run(root, invalid).status, 2)
      assert.deepEqual(contents(root), before)
    }
    assert.equal(run(root).status, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses to bump an already inconsistent tree', () => {
  const root = fixture()
  try {
    writeFileSync(join(root, 'src-tauri/Cargo.toml'), '[package]\nname = "mathboard"\nversion = "1.13.0"\n')
    const before = contents(root)
    const result = run(root, '1.15.0')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /inconsistent/)
    assert.deepEqual(contents(root), before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
