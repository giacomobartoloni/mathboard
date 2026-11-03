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
import { Rect, IText } from 'fabric';
import { installFabricDomStub } from './helpers/fabric-dom-stub.js';
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js';
import { captureObjectClipboard, makeClipboardPasteSpecs } from '../src/board/clipboard/selectionClipboard.js';

installFabricDomStub();

test('copy captures identity-free immutable primitives without changing the canvas', () => {
  const rect = new Rect({ left: 45, top: 35, width: 60, height: 30,
    fill: 'transparent', stroke: '#112233' });
  rect.mathboardRenderedInkIsLight = true;
  const canvas = {
    getActiveObject: () => rect,
    getActiveObjects: () => [rect],
    getObjects: () => [rect],
  };
  const snapshot = captureObjectClipboard(canvas, new BoardObjectPolicy());
  assert.equal(snapshot.specs.length, 1);
  assert.equal(snapshot.specs[0].type, 'rect');
  assert.equal('id' in snapshot.specs[0], false);
  assert.equal('mathboardRenderedInkIsLight' in snapshot.specs[0], false);
  const originalLeft = snapshot.specs[0].left;
  rect.left = 999;
  assert.equal(snapshot.specs[0].left, originalLeft);
  const first = makeClipboardPasteSpecs(snapshot, { x: 300, y: 200 }, 1);
  const second = makeClipboardPasteSpecs(snapshot, { x: 300, y: 200 }, 2);
  assert.equal(first.length, 1);
  assert.equal(second[0].left - first[0].left, 16);
  first[0].left = -42;
  assert.equal(snapshot.specs[0].left, originalLeft);
});

test('copy respects text font attributes and rejects an empty selection', () => {
  const text = new IText('math', { left: 15, top: 22, fontFamily: 'monospace', fontSize: 48 });
  const canvas = {
    getActiveObject: () => text,
    getActiveObjects: () => [text],
    getObjects: () => [text],
  };
  const snapshot = captureObjectClipboard(canvas, new BoardObjectPolicy());
  assert.equal(snapshot.specs[0].fontFamily, 'monospace');
  assert.equal(snapshot.specs[0].fontSize, 48);
  assert.equal(captureObjectClipboard({ ...canvas, getActiveObject: () => null }, new BoardObjectPolicy()), null);
  assert.equal(makeClipboardPasteSpecs(null, { x: 1, y: 1 }).length, 0);
});
