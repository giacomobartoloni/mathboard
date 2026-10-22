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

import { IText } from "fabric";

const DEFAULT_TEXT_CONFIG = { content: "Text", fontSize: 32, fontFamily: "Arial" };
const LEFT_TOP_ORIGIN = { originX: "left", originY: "top" };

/**
 * Owns only the initial one-shot text placeholder and its editing exit.
 * Later edits still use DrawBoard's native transform/text history listeners.
 */
export class TextInsertionSession {
  constructor({
    canvas, getInk, getInkMode, scheduleFocus,
    onStarted = () => {}, onCommitted, onCancelled, onComplete,
  }) {
    this.canvas = canvas;
    this.getInk = getInk;
    this.getInkMode = getInkMode;
    this.scheduleFocus = scheduleFocus;
    this.onStarted = onStarted;
    this.onCommitted = onCommitted;
    this.onCancelled = onCancelled;
    this.onComplete = onComplete;
    this.active = false;
    this.pending = null;
    this._finalize = null;
    this._down = (opt) => this.start(opt);
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this.canvas.on("mouse:down", this._down);
  }

  deactivate() {
    if (!this.active) return;
    this.canvas.off("mouse:down", this._down);
    this.active = false;
    // Do not discard a text being edited merely because the toolbar changed.
  }

  owns(object) {
    return this.pending === object;
  }

  hasPending() {
    return Boolean(this.pending);
  }

  isPendingEditing() {
    return Boolean(this.pending?.isEditing);
  }

  clearStale() {
    if (!this.pending || this.pending.isEditing) return false;
    this.pending.off("editing:exited", this._finalize);
    this.pending = null;
    this._finalize = null;
    return true;
  }

  start(opt) {
    if (!this.active || opt.target || this.pending) return false;
    const point = opt.scenePoint || this.canvas.getScenePoint(opt.e);
    const text = new IText(DEFAULT_TEXT_CONFIG.content, {
      left: point.x, top: point.y, ...LEFT_TOP_ORIGIN,
      fontSize: DEFAULT_TEXT_CONFIG.fontSize,
      fill: this.getInk(),
      fontFamily: DEFAULT_TEXT_CONFIG.fontFamily,
      editable: true, selectable: true, evented: true,
      hasControls: true, hasBorders: true,
      lockMovementX: false, lockMovementY: false,
      lockRotation: false, lockScalingX: false,
      lockScalingY: false, lockScalingFlip: false,
      lockSkewingX: false, lockSkewingY: false,
    });
    text.mathboardInkMode = this.getInkMode();
    this.pending = text;
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    this.onStarted(text);
    this.scheduleFocus(() => {
      if (this.pending !== text) return;
      text.enterEditing();
      text.selectAll();
      text.hiddenTextarea?.focus();
    });
    const finalize = () => {
      text.off("editing:exited", finalize);
      if (this.pending !== text) return;
      this.pending = null;
      this._finalize = null;
      if (!text.text.trim() || text.text === DEFAULT_TEXT_CONFIG.content) {
        this.onCancelled(text);
      } else {
        this.onCommitted(text);
      }
      this.canvas.requestRenderAll();
      this.deactivate();
      this.onComplete();
    };
    this._finalize = finalize;
    text.on("editing:exited", finalize);
    return true;
  }

  reset() {
    if (this.pending && this._finalize) {
      this.pending.off("editing:exited", this._finalize);
    }
    this.pending = null;
    this._finalize = null;
  }

  dispose() {
    this.deactivate();
    this.reset();
  }
}
