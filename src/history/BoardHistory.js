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

import { applySnapshot, HISTORY_LIMIT } from "./commandLog.js";

/**
 * Retains live Fabric identities and commits history independently of Vue.
 * Canvas rollback for controller mutations remains the controller's responsibility.
 */
export class BoardHistory {
  constructor({ getCanvas, onDocumentChanged, syncAutoInk }) {
    this._getCanvas = getCanvas;
    this._onDocumentChanged = onDocumentChanged;
    this._syncAutoInk = syncAutoInk;
    this._entries = [];
    this._step = -1;
    this._suspended = false;
    this._tipKind = "command";
  }

  summary() {
    return {
      length: this._entries.length,
      step: this._step,
      tipType: this._entries[this._step]?.type ?? null,
    };
  }

  isSuspended() {
    return this._suspended;
  }

  setSuspended(suspended) {
    this._suspended = Boolean(suspended);
  }

  runSuspended(callback) {
    const previous = this._suspended;
    this._suspended = true;
    try {
      return callback();
    } finally {
      this._suspended = previous;
    }
  }

  reset() {
    this._entries = [];
    this._step = -1;
    this._tipKind = "command";
  }

  /**
   * Copy only the command spine/changed recolor entries: never clone Fabric
   * objects or mutate a previously committed command before notification.
   */
  record(command, { coalesce = false } = {}) {
    if (this._suspended) return false;
    const previousEntries = this._entries;
    const previousStep = this._step;
    const previousTipKind = this._tipKind;
    const tip = this._entries[this._step];
    const replaceTip = coalesce
      && command.type === "recolor"
      && this._tipKind === "recolor-coalesce"
      && tip?.type === "recolor"
      && this._step === this._entries.length - 1;
    if (replaceTip) {
      const updated = tip.entries.map((entry) => ({ ...entry }));
      const byObject = new Map(updated.map((entry, index) => [entry.object, index]));
      for (const entry of command.entries) {
        const index = byObject.get(entry.object);
        if (index === undefined) {
          byObject.set(entry.object, updated.length);
          updated.push(entry);
        } else {
          updated[index] = { ...updated[index], after: entry.after };
        }
      }
      this._entries = this._entries.slice();
      this._entries[this._step] = { ...tip, entries: updated };
    } else {
      this._entries = [...this._entries.slice(0, this._step + 1), command];
      if (this._entries.length > HISTORY_LIMIT) this._entries.shift();
      this._step = this._entries.length - 1;
      this._tipKind = coalesce && command.type === "recolor" ? "recolor-coalesce" : "command";
    }
    try {
      this._onDocumentChanged();
    } catch (error) {
      this._entries = previousEntries;
      this._step = previousStep;
      this._tipKind = previousTipKind;
      throw error;
    }
    return true;
  }

  undo() {
    return this._replay("undo");
  }

  redo() {
    return this._replay("redo");
  }

  _replay(direction) {
    const canvas = this._getCanvas();
    if (!canvas) return null;
    if (direction === "undo" && this._step < 0) return null;
    if (direction === "redo" && this._step >= this._entries.length - 1) return null;
    const index = direction === "undo" ? this._step : this._step + 1;
    const command = this._entries[index];
    this.runSuspended(() => {
      this._applyCommand(command, direction === "undo" ? "inverse" : "forward");
      // AUTO ink resolves against the active theme after retained-object replay.
      this._syncAutoInk();
    });
    this._step = direction === "undo" ? index - 1 : index;
    canvas.requestRenderAll();
    return command;
  }

  // The initial Text placeholder is removed without a history command.
  removeRetained(object) {
    this._removeRetained(object);
  }

    _insertRetained(object, index) {
      if (!object || this._getCanvas().getObjects().includes(object)) return;
      const at = Math.max(0, Math.min(index, this._getCanvas().getObjects().length));
      this._getCanvas().insertAt(at, object);
    }
    _selectionHolds(object) {
      const active = this._getCanvas().getActiveObject();
      if (!active) return false;
      if (active === object) return true;
      return active.isType('ActiveSelection') && active.getObjects().includes(object);
    }
    _removeRetained(object) {
      if (!object || !this._getCanvas().getObjects().includes(object)) return;
      if (this._selectionHolds(object)) {
        this._getCanvas().discardActiveObject();
      }
      this._getCanvas().remove(object);
    }
    _applyCommand(command, direction) {
      const canvas = this._getCanvas();
      const previous = canvas.renderOnAddRemove;
      canvas.renderOnAddRemove = false;
      try {
        if (command.type === 'add') {
          if (direction === 'forward') this._insertRetained(command.object, command.index);
          else this._removeRetained(command.object);
          return;
        }

        if (command.type === 'duplicate' || command.type === 'batch-add') {
          if (direction === 'forward') {
            command.entries.slice().sort((a, b) => a.index - b.index)
              .forEach(({ object, index }) => this._insertRetained(object, index));
          } else {
            canvas.discardActiveObject();
            command.entries.forEach(({ object }) => this._removeRetained(object));
          }
          return;
        }

        if (command.type === 'delete') {
          if (direction === 'forward') {
            canvas.discardActiveObject();
            command.entries.forEach(({ object }) => canvas.remove(object));
          } else {
            // Lowest index first, so each stored index still lands in the gap
            // left by the objects deleted after it.
            command.entries.forEach(({ object, index }) => this._insertRetained(object, index));
          }
          return;
        }

        if (command.type === 'replace') {
          canvas.discardActiveObject();
          if (direction === 'forward') {
            this._removeRetained(command.removed);
            this._insertRetained(command.added, command.index);
          } else {
            this._removeRetained(command.added);
            this._insertRetained(command.removed, command.index);
          }
          return;
        }

        if (command.type === 'recolor') {
          command.entries.forEach(({ object, before, after }) => {
            object.set(direction === 'forward' ? after : before);
            object.dirty = true;
          });
          return;
        }

        if (command.type === 'group') {
          if (direction === 'forward') {
            canvas.discardActiveObject();
            command.members.forEach(({ object }) => this._removeRetained(object));
            if (typeof command.group.size === 'function' && command.group.size() === 0) {
              command.group.add(...command.members.map((entry) => entry.object));
            }
            this._insertRetained(command.group, command.index);
          } else {
            canvas.discardActiveObject();
            if (typeof command.group.size === 'function' && command.group.size() > 0) {
              command.group.removeAll();
            }
            this._removeRetained(command.group);
            command.members.forEach(({ object, index }) => this._insertRetained(object, index));
          }
          return;
        }

        if (command.type === 'ungroup') {
          if (direction === 'forward') {
            canvas.discardActiveObject();
            if (typeof command.group.size === 'function' && command.group.size() > 0) {
              command.group.removeAll();
            }
            this._removeRetained(command.group);
            command.members.forEach(({ object, index }) => this._insertRetained(object, index));
          } else {
            canvas.discardActiveObject();
            command.members.forEach(({ object }) => this._removeRetained(object));
            if (typeof command.group.size === 'function' && command.group.size() === 0) {
              command.group.add(...command.members.map((entry) => entry.object));
            }
            this._insertRetained(command.group, command.index);
          }
          return;
        }

        if (command.type === 'modify') {
          // Absolute left/top written while the object is still in a selection
          // are group coordinates, and the object jumps. Leave the selection first.
          canvas.discardActiveObject();
          command.entries.forEach(({ object, before, after }) => {
            applySnapshot(object, direction === 'forward' ? after : before);
          });
        }
      } finally {
        canvas.renderOnAddRemove = previous;
      }
    }

}
