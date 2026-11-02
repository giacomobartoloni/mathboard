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

import { Group, ActiveSelection } from "fabric";
import { ensureMathBoardObjectId, regenerateMathBoardObjectIds } from "../ids.js";
import { FORMULA_CLONE_PROPS } from "../../formulas/constants.js";
import { DUPLICATE_OFFSET } from "../../config/selectionActions.js";
import { applyAutoInk, applyExplicitInk, flattenInkTargets } from "../../config/colors.js";
import { isExtendedShape } from "../objects/shapeInk.js";
import { snapshotObject, applySnapshot } from "../../history/commandLog.js";

/**
 * Owns direct UI selection mutations and their history commands.
 * App-facing presentation stays in DrawBoard. A narrow callback reports
 * categorical effects only after history accepts a command.
 */
const STROKE_INK_TYPES = ["Path", "Rect", "Circle", "Line"];
const FILL_INK_TYPES = ["IText", "Text", "Textbox"];

export class SelectionMutations {
  constructor({ getCanvas, history, boardObjectPolicy, getDefaultInk, onCommittedOperation = () => {}, lifecycle = null }) {
    this._getCanvas = getCanvas;
    this._history = history;
    this._policy = boardObjectPolicy;
    this._getDefaultInk = getDefaultInk;
    this._onCommittedOperation = onCommittedOperation;
    this._lifecycle = lifecycle;
  }

  _canMutate() {
    return !this._lifecycle || this._lifecycle.isReady();
  }

  _selection(canvas) {
    const active = canvas.getActiveObject();
    const selected = canvas.getActiveObjects().slice();
    const multiple = this._policy.isActiveSelection(active);
    // Save local geometry as well as scene-plane geometry: discarding an
    // ActiveSelection changes membership and the members' coordinate plane.
    const selectionSnapshot = multiple ? snapshotObject(active) : null;
    const local = multiple ? selected.map((object) => ({
      object,
      snapshot: Object.fromEntries(
        Object.keys(snapshotObject(object)).map((key) => [key, object[key]]),
      ),
    })) : [];
    return { active, selected, multiple, selectionSnapshot, local };
  }

  _restoreSelection(canvas, selection) {
    if (!selection.active) return;
    if (selection.multiple) {
      selection.active.removeAll();
      selection.active.add(...selection.selected);
      applySnapshot(selection.active, selection.selectionSnapshot);
      selection.local.forEach(({ object, snapshot }) => applySnapshot(object, snapshot));
    }
    canvas.setActiveObject(selection.active);
  }

  _restoreRoots(canvas, roots) {
    roots.forEach(({ object, index, snapshot }) => {
      if (!canvas.getObjects().includes(object)) canvas.insertAt(index, object);
      if (snapshot) applySnapshot(object, snapshot);
    });
  }

  _record(command, effect) {
    if (!this._history.record(command)) {
      throw new Error("Selection mutation could not be recorded.");
    }
    if (effect) {
      try { this._onCommittedOperation(effect); } catch (error) {
        console.error('Board effect callback failed after commit.', error);
      }
    }
  }

  _presentAfterCommit(canvas, updateSelection = () => {}) {
    try {
      updateSelection();
      canvas.requestRenderAll();
    } catch (error) {
      console.error('Board selection refresh failed after commit.', error);
    }
  }

  group() {
    if (!this._canMutate()) return false;
    const canvas = this._getCanvas();
    const active = canvas?.getActiveObject();
    if (!active || !this._policy.isActiveSelection(active)) return false;
    const objects = active.getObjects().slice();
    if (objects.length < 2) return false;
    // UI grouping intentionally permits an existing Board Group. The
    // programmable BoardController grouping policy is different.
    const members = objects.map((object) => ({
      object,
      index: canvas.getObjects().indexOf(object),
    })).filter(({ index }) => index >= 0).sort((a, b) => a.index - b.index);
    if (members.length < 2) return false;

    const selection = this._selection(canvas);
    const roots = members.map(({ object, index }) => ({
      object, index, snapshot: snapshotObject(object),
    }));
    let group = null;
    try {
      this._history.runSuspended(() => {
        canvas.discardActiveObject();
        members.forEach(({ object }) => canvas.remove(object));
        group = new Group(members.map(({ object }) => object), {
          subTargetCheck: false, interactive: false,
        });
        ensureMathBoardObjectId(group);
        canvas.add(group);
        canvas.setActiveObject(group);
      });
      const index = canvas.getObjects().indexOf(group);
      if (index < 0) throw new Error("Grouped object was not inserted.");
      this._record({ type: "group", group, index, members }, { kind: 'group' });
    } catch (error) {
      this._history.runSuspended(() => {
        canvas.discardActiveObject();
        if (group) {
          if (group.size() > 0) group.removeAll();
          canvas.remove(group);
        }
        this._restoreRoots(canvas, roots);
        this._restoreSelection(canvas, selection);
      });
      canvas.requestRenderAll();
      throw error;
    }
    this._presentAfterCommit(canvas);
    return true;
  }

  ungroup() {
    if (!this._canMutate()) return false;
    const canvas = this._getCanvas();
    const group = canvas?.getActiveObject();
    // A Formula can be implemented as a Fabric Group; it remains atomic.
    if (!this._policy.isBoardGroup(group)) return false;
    const index = canvas.getObjects().indexOf(group);
    if (index < 0) return false;
    const original = group.getObjects().slice();
    const groupSnapshot = snapshotObject(group);
    const childLocal = original.map((object) => ({ object, snapshot: snapshotObject(object) }));
    let items = [];
    try {
      this._history.runSuspended(() => {
        canvas.discardActiveObject();
        items = group.removeAll();
        canvas.remove(group);
        items.forEach((object) => canvas.add(object));
      });
      const members = items.map((object) => ({
        object, index: canvas.getObjects().indexOf(object),
      })).filter(({ index: at }) => at >= 0);
      this._record({ type: "ungroup", group, index, members }, { kind: 'ungroup' });
    } catch (error) {
      this._history.runSuspended(() => {
        canvas.discardActiveObject();
        original.forEach((object) => canvas.remove(object));
        if (group.size() > 0) group.removeAll();
        group.add(...original);
        applySnapshot(group, groupSnapshot);
        childLocal.forEach(({ object, snapshot }) => applySnapshot(object, snapshot));
        if (!canvas.getObjects().includes(group)) canvas.insertAt(index, group);
        canvas.setActiveObject(group);
      });
      canvas.requestRenderAll();
      throw error;
    }
    this._presentAfterCommit(canvas, () => {
      if (items.length > 1) {
        canvas.setActiveObject(new ActiveSelection(items, { canvas }));
      } else if (items.length === 1) {
        canvas.setActiveObject(items[0]);
      } else {
        canvas.discardActiveObject();
      }
    });
    return true;
  }


  delete() {
    if (!this._canMutate()) return [];
    const canvas = this._getCanvas();
    const active = canvas?.getActiveObject();
    if (!active || active.isEditing) return [];
    const objects = canvas.getActiveObjects().slice();
    const entries = objects.map((object) => ({
      object, index: canvas.getObjects().indexOf(object),
    })).filter(({ index }) => index >= 0).sort((a, b) => a.index - b.index);
    if (!entries.length) return [];

    const selection = this._selection(canvas);
    const roots = entries.map(({ object, index }) => ({
      object, index, snapshot: snapshotObject(object),
    }));
    const objectKinds = entries.map(({ object }) => {
      try { return this._policy.kindOf(object) || 'unknown'; } catch { return 'unknown'; }
    });
    try {
      this._history.runSuspended(() => {
        canvas.discardActiveObject();
        entries.forEach(({ object }) => canvas.remove(object));
      });
      this._record({ type: "delete", entries }, {
        kind: 'delete', objectKinds,
      });
    } catch (error) {
      this._history.runSuspended(() => {
        this._restoreRoots(canvas, roots);
        this._restoreSelection(canvas, selection);
      });
      canvas.requestRenderAll();
      throw error;
    }
    this._presentAfterCommit(canvas);
    return entries.map(({ object }) => object);
  }
  async _cloneForDuplicate(object) {
    const placed = snapshotObject(object);
    const clone = await object.clone(FORMULA_CLONE_PROPS);
    clone.set({
      ...placed,
      left: placed.left + DUPLICATE_OFFSET,
      top: placed.top + DUPLICATE_OFFSET,
    });
    FORMULA_CLONE_PROPS.forEach((key) => {
      if (object[key] !== undefined) clone[key] = object[key];
    });
    // Cloned Board Groups and their descendants must never reuse source IDs.
    regenerateMathBoardObjectIds(clone);
    clone.setCoords();
    return clone;
  }

  async duplicate() {
    if (!this._canMutate()) return false;
    const lease = this._lifecycle?.capture();
    const canvas = this._getCanvas();
    const active = canvas?.getActiveObject();
    if (!active || active.isEditing) return false;
    const sources = canvas.getActiveObjects().slice();
    if (!sources.length) return false;

    let clones;
    try {
      clones = await Promise.all(sources.map((object) => this._cloneForDuplicate(object)));
    } catch (error) {
      console.error("Duplicate failed", error);
      return false;
    }
    if (this._getCanvas() !== canvas || clones.some((clone) => !clone)
      || (lease && !this._lifecycle.assertCurrent(lease))) return false;
    if (!sources.every((object) => canvas.getObjects().includes(object))) return false;

    const selection = this._selection(canvas);
    try {
      this._history.runSuspended(() => {
        clones.forEach((clone) => canvas.add(clone));
        if (clones.length === 1) {
          canvas.setActiveObject(clones[0]);
        } else {
          canvas.setActiveObject(new ActiveSelection(clones, { canvas }));
        }
      });
      const entries = clones.map((object) => ({
        object, index: canvas.getObjects().indexOf(object),
      }));
      if (entries.some(({ index }) => index < 0)) {
        throw new Error("Duplicate was not inserted.");
      }
      this._record({ type: "duplicate", entries });
    } catch (error) {
      this._history.runSuspended(() => {
        canvas.discardActiveObject();
        clones.forEach((clone) => canvas.remove(clone));
        this._restoreSelection(canvas, selection);
      });
      canvas.requestRenderAll();
      throw error;
    }
    this._presentAfterCommit(canvas);
    return true;
  }

  _inkSnapshot(object) {
    if (!object || this._policy.isFormula(object)) return null;
    if (isExtendedShape(object)) {
      return { stroke: object.stroke, fill: object.fill, mathboardInkMode: object.mathboardInkMode };
    }
    if (object.isType(...STROKE_INK_TYPES)) {
      const snapshot = { stroke: object.stroke, mathboardInkMode: object.mathboardInkMode };
      if (object.isType("Circle") && object.fill && object.fill !== "transparent") {
        snapshot.fill = object.fill;
      }
      return snapshot;
    }
    if (object.isType(...FILL_INK_TYPES)) {
      return { fill: object.fill, mathboardInkMode: object.mathboardInkMode };
    }
    return null;
  }

  recolor(color, { coalesce = false } = {}) {
    if (!this._canMutate()) return false;
    const canvas = this._getCanvas();
    const active = canvas?.getActiveObject();
    if (!active) return false;
    const targets = flattenInkTargets([active]);
    const snapshots = targets.map((object) => ({
      object, before: this._inkSnapshot(object),
    })).filter(({ before }) => before !== null);
    if (!snapshots.length) return false;

    const useAuto = color === null;
    const ink = useAuto ? this._getDefaultInk() : color;
    const entries = [];
    try {
      snapshots.forEach(({ object, before }) => {
        const applied = useAuto ? applyAutoInk(object, ink) : applyExplicitInk(object, ink);
        if (applied) entries.push({ object, before, after: this._inkSnapshot(object) });
      });
      if (!entries.length) return false;
      if (active.isType("ActiveSelection") || active.isType("Group")) {
        active.set("dirty", true);
      }
      if (!this._history.record({ type: "recolor", entries }, { coalesce: Boolean(coalesce) })) {
        throw new Error("Selection recolor could not be recorded.");
      }
    } catch (error) {
      // BoardHistory restores its log/coalesced tip. Revert every live target,
      // including ones painted before another target raised an exception.
      snapshots.forEach(({ object, before }) => {
        object.set(before);
        object.dirty = true;
      });
      canvas.requestRenderAll();
      throw error;
    }
    this._presentAfterCommit(canvas);
    return true;
  }

}
