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

import { util } from "fabric";

export const HISTORY_LIMIT = 50;

// Position is origin-relative, so a layout snapshot always keeps the origin
// next to left/top. These are the fields a move, scale, or rotate changes.
const TRANSFORM_KEYS = [
  "left",
  "top",
  "scaleX",
  "scaleY",
  "skewX",
  "skewY",
  "angle",
  "flipX",
  "flipY",
  "originX",
  "originY",
];

// applyTransformToObject writes this set and nothing else. Restoring it puts
// the live object back; a second sendObjectToPlane would not be bit-exact.
const PLANE_RESTORE_KEYS = [
  "left",
  "top",
  "scaleX",
  "scaleY",
  "skewX",
  "skewY",
  "angle",
  "flipX",
  "flipY",
];

const TEXT_CONTENT_KEYS = [
  "text",
  "styles",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "underline",
  "linethrough",
  "overline",
  "textAlign",
  "lineHeight",
  "charSpacing",
];

function isActiveSelection(object) {
  return Boolean(object && object.isType && object.isType("ActiveSelection"));
}

function keysFor(object) {
  if (object.isType("IText", "Text", "Textbox")) {
    // `text` is applied before width/height: Fabric recalculates dimensions
    // inside set("text"), and the saved size has to win.
    return [...TEXT_CONTENT_KEYS, "width", "height", ...TRANSFORM_KEYS];
  }
  if (object.isType("Circle")) {
    return ["radius", ...TRANSFORM_KEYS];
  }
  if (object.isType("Line", "Rect", "Image")) {
    // Line endpoints are not included. Setting x1/y1/x2/y2 recenters the line
    // and would fight the saved left/top. Width and height are the length.
    return ["width", "height", ...TRANSFORM_KEYS];
  }
  if (object.isType("Path")) {
    // The path commands stay on the instance. A move must not copy them.
    return TRANSFORM_KEYS;
  }
  if (object.isType("Group", "ActiveSelection")) {
    // Permanent groups and temporary selections: layout only. Children stay
    // on the instance; undo of a move does not rebuild the tree.
    return ["width", "height", ...TRANSFORM_KEYS];
  }
  return ["width", "height", ...TRANSFORM_KEYS];
}

function copyValue(key, value) {
  if (key === "styles") {
    return value ? JSON.parse(JSON.stringify(value)) : {};
  }
  return value;
}

function pickKeys(object, keys) {
  const snapshot = {};
  keys.forEach((key) => {
    snapshot[key] = copyValue(key, object[key]);
  });
  return snapshot;
}

/**
 * Canvas-absolute fields for one object. Path commands and image pixels are
 * not copied; undo of a move writes these fields back onto the same instance.
 * transform.original is not used: it is only scale, skew, angle, left, top,
 * and flip of the gesture target, and its origin is the control corner.
 */
export function snapshotObject(object) {
  const keys = keysFor(object);
  const group = object.group;
  if (!isActiveSelection(group)) {
    return pickKeys(object, keys);
  }

  const saved = pickKeys(object, PLANE_RESTORE_KEYS);
  try {
    util.sendObjectToPlane(object, group.calcTransformMatrix());
    return pickKeys(object, keys);
  } finally {
    object.set(saved);
    object.setCoords();
  }
}

export function applySnapshot(object, snapshot) {
  const next = {};
  Object.keys(snapshot).forEach((key) => {
    next[key] = copyValue(key, snapshot[key]);
  });
  object.set(next);
  object.setCoords();
  object.dirty = true;
}

export function snapshotsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function gestureObjects(target) {
  if (!target) return [];
  if (isActiveSelection(target)) return target.getObjects().slice();
  return [target];
}
