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
import test from 'node:test'
import { generateBoardName } from '../src/board/names/generateBoardName.js'

function sequence(...values) {
  let index = 0
  return () => values[index++]
}

test('generates both requested naming styles and additional mathematical pairings', () => {
  assert.equal(generateBoardName(sequence(0, 0, 0)), 'flashy-fermat')
  assert.equal(generateBoardName(sequence(0.25, 0, 0)), 'albert-parabola')
  assert.equal(generateBoardName(sequence(0.5, 0, 0)), 'parabola-fermat')
  assert.equal(generateBoardName(sequence(0.75, 0, 0)), 'albert-fermat')
})

test('generated names are short printable lowercase two-word slugs', () => {
  const names = new Set()
  for (let index = 0; index < 100; index += 1) {
    const values = [index % 4 / 4, (index * 7 % 97) / 97, (index * 13 % 89) / 89]
    const name = generateBoardName(sequence(...values))
    assert.match(name, /^[a-z]+-[a-z]+$/)
    assert.ok(name.length <= 120)
    names.add(name)
  }
  assert.ok(names.size > 50)
})
