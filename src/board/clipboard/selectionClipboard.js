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

import { readSemanticBoardObject, toBoardDocumentNode } from '../objects/serialize.js';

/**
 * Take a detached, identity-free semantic snapshot. The native clipboard is
 * intentionally not touched: this local-first clipboard remains in memory for
 * this running tab, including when the active board changes.
 */
export function captureObjectClipboard(canvas, boardObjectPolicy) {
  const active = canvas?.getActiveObject();
  if (!active || active.isEditing) return null;
  const roots = canvas.getObjects();
  const selected = canvas.getActiveObjects().filter((object) => roots.includes(object));
  if (!selected.length) return null;
  const box = active.getBoundingRect();
  const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
  const specs = selected.map((object) => toBoardDocumentNode(
    readSemanticBoardObject(object, { boardObjectPolicy, includeId: false }),
  ));
  return { specs: structuredClone(specs), center, pasteCount: 0 };
}

/** Translate selected roots as one unit; descendants retain local coordinates. */
export function makeClipboardPasteSpecs(clipboard, destination, pasteCount = 1) {
  if (!clipboard?.specs?.length || !Number.isFinite(destination?.x)
    || !Number.isFinite(destination?.y)) return [];
  const offset = 16 * Math.max(1, Math.min(100, Math.trunc(pasteCount) || 1));
  const dx = destination.x - clipboard.center.x + offset;
  const dy = destination.y - clipboard.center.y + offset;
  const specs = structuredClone(clipboard.specs);
  for (const node of specs) {
    node.left = (node.left ?? 0) + dx;
    node.top = (node.top ?? 0) + dy;
  }
  return specs;
}
