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
import { ensureMathBoardObjectId } from "../ids.js";
import { snapshotObject, applySnapshot } from "../../history/commandLog.js";

/**
 * Owns direct UI selection mutations and their history commands.
 * Presentation, analytics, and App-facing methods stay in DrawBoard.
 */
export class SelectionMutations {
  constructor({ getCanvas, history, boardObjectPolicy, getDefaultInk }) {
    this._getCanvas = getCanvas;
    this._history = history;
    this._policy = boardObjectPolicy;
    this._getDefaultInk = getDefaultInk;
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

  _record(command) {
    if (!this._history.record(command)) {
      throw new Error("Selection mutation could not be recorded.");
    }
  }

  group() {
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
      this._record({ type: "group", group, index, members });
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
    canvas.requestRenderAll();
    return true;
  }

  ungroup() {
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
      this._record({ type: "ungroup", group, index, members });
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
    if (items.length > 1) {
      canvas.setActiveObject(new ActiveSelection(items, { canvas }));
    } else if (items.length === 1) {
      canvas.setActiveObject(items[0]);
    } else {
      canvas.discardActiveObject();
    }
    canvas.requestRenderAll();
    return true;
  }


  delete() {
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
    try {
      this._history.runSuspended(() => {
        canvas.discardActiveObject();
        entries.forEach(({ object }) => canvas.remove(object));
      });
      this._record({ type: "delete", entries });
    } catch (error) {
      this._history.runSuspended(() => {
        this._restoreRoots(canvas, roots);
        this._restoreSelection(canvas, selection);
      });
      canvas.requestRenderAll();
      throw error;
    }
    canvas.requestRenderAll();
    return entries.map(({ object }) => object);
  }
}
