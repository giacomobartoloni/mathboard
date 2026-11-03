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

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAP_PREFERENCE_KEY, loadSnapPreference, saveSnapPreference,
} from '../src/config/snapPreferences.js';

test('local Snap to Grid preference defaults off, persists and validates input', () => {
  const original = globalThis.window;
  const memory = new Map();
  try {
    globalThis.window = {
      localStorage: {
        getItem: (key) => memory.get(key) ?? null,
        setItem: (key, value) => memory.set(key, value),
      },
    };
    assert.equal(loadSnapPreference(), false);
    assert.equal(saveSnapPreference(true), true);
    assert.equal(memory.get(SNAP_PREFERENCE_KEY), 'true');
    assert.equal(loadSnapPreference(), true);
    memory.set(SNAP_PREFERENCE_KEY, 'invalid');
    assert.equal(loadSnapPreference(), false);
    assert.equal(saveSnapPreference(false), true);
    assert.equal(loadSnapPreference(), false);
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});

test('blocked localStorage fails closed without throwing', () => {
  const original = globalThis.window;
  try {
    globalThis.window = {
      get localStorage() { throw new Error('denied'); },
    };
    assert.equal(loadSnapPreference(), false);
    assert.equal(saveSnapPreference(true), false);
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});
