/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardHistory } from '../src/history/BoardHistory.js';
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js';
import { BoardPersistenceService } from '../src/board/persistence/BoardPersistenceService.js';
import { replaceBoardFromDocument } from '../src/board/persistence/replaceBoardFromDocument.js';

const EMPTY_DOCUMENT = { format: 'mathboard-board', version: 1, title: 'Empty', objects: [] };

function makeHarness() {
  const initial = { id: 'existing' };
  const objects = [initial];
  let failRemove = false;
  const canvas = {
    getObjects: () => objects.slice(),
    remove(object) {
      if (failRemove) throw new Error('remove failed');
      const index = objects.indexOf(object);
      if (index >= 0) objects.splice(index, 1);
    },
    add(object) { objects.push(object); },
    discardActiveObject() {},
    requestRenderAll() {},
  };
  const history = new BoardHistory({
    getCanvas: () => canvas,
    onDocumentChanged() {},
    syncAutoInk() {},
  });
  const records = new Map([['target', { id: 'target', title: 'Target', document: EMPTY_DOCUMENT }]]);
  const repository = {
    async get(id) { return records.get(id) || null; },
    async put(record) { records.set(record.id, record); return record; },
  };
  const service = new BoardPersistenceService({
    repository,
    boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => canvas,
    buildFormula: async () => null,
    resetHistory: () => history.reset(),
    // Compatibility callback is deliberately present; scoped ownership must win.
    suspendHistory: (flag) => history.setSuspended(flag),
    runWithoutHistory: (callback) => history.runSuspended(callback),
    getTitle: () => 'New',
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  return { canvas, history, service, objects, initial, failRemove: () => { failRemove = true; } };
}

test('creating a new board preserves a pre-existing history suspension', async () => {
  for (const prior of [false, true]) {
    const { history, service, objects } = makeHarness();
    history.setSuspended(prior);
    await service.createNewBoard();
    assert.equal(history.isSuspended(), prior);
    assert.equal(objects.length, 0);
    service.dispose();
  }
});

test('a canvas removal error restores the outer history suspension', async () => {
  const { history, service, failRemove, objects } = makeHarness();
  history.setSuspended(true);
  failRemove();
  await assert.rejects(() => service.createNewBoard(), /remove failed/);
  assert.equal(history.isSuspended(), true);
  assert.equal(objects.length, 1);
  service.dispose();
});

test('opening a board composes with an outer suspended history scope', async () => {
  const { history, service, objects } = makeHarness();
  history.setSuspended(true);
  await service.openBoard('target');
  assert.equal(history.isSuspended(), true);
  assert.equal(objects.length, 0);
  service.dispose();
});

test('document replacement error preserves outer history state', async () => {
  const { history, canvas, failRemove, objects } = makeHarness();
  history.setSuspended(true);
  failRemove();
  await assert.rejects(() => replaceBoardFromDocument({
    canvas,
    document: EMPTY_DOCUMENT,
    buildFormula: async () => null,
    resetHistory: () => history.reset(),
    runWithoutHistory: (callback) => history.runSuspended(callback),
  }), /remove failed/);
  assert.equal(history.isSuspended(), true);
  assert.equal(objects.length, 1);
});
