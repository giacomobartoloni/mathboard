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

/** Owns pan pointer/touch subscriptions and the live viewport drag. */
export class PanGesture {
  constructor({ canvas, canStartMiddle = () => true, onStart = () => {}, onFinish = () => {} }) {
    this.canvas = canvas;
    this.canStartMiddle = canStartMiddle;
    this.onStart = onStart;
    this.onFinish = onFinish;
    this.active = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this._down = (opt) => this.start(opt);
    this._move = (opt) => this.move(opt);
    this._up = () => this.finish();
    this._middleEnabled = false;
    this._middleWindow = null;
    this._middleDown = (event) => this.onMiddleMouseDown(event);
    this._middleMove = (event) => this.onMiddleMouseMove(event);
    this._middleUp = (event) => this.onMiddleMouseUp(event);
    this._middleBlur = () => this.stopMiddleMousePan();
    this._middleAuxClick = (event) => this.onMiddleAuxClick(event);
  }

  activate() {
    if (this.active) return;
    this.active = true;
    for (const [event, listener] of this._listeners()) this.canvas.on(event, listener);
  }

  _listeners() {
    return [
      ["mouse:down", this._down], ["mouse:move", this._move], ["mouse:up", this._up],
      ["touch:start", this._down], ["touch:move", this._move], ["touch:end", this._up],
    ];
  }

  enableMiddleMouse() {
    if (this._middleEnabled) return;
    this.canvas.upperCanvasEl.addEventListener('mousedown', this._middleDown, true);
    this.canvas.upperCanvasEl.addEventListener('auxclick', this._middleAuxClick, true);
    this._middleEnabled = true;
  }

  disableMiddleMouse() {
    if (!this._middleEnabled) return;
    this.stopMiddleMousePan();
    this.canvas.upperCanvasEl.removeEventListener('mousedown', this._middleDown, true);
    this.canvas.upperCanvasEl.removeEventListener('auxclick', this._middleAuxClick, true);
    this._middleEnabled = false;
  }

  onMiddleMouseDown(event) {
    if (event.button !== 1 || !this.canStartMiddle()) return;
    // Capture before Fabric dispatches events to the active tool.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!this.startMiddle(event)) return;
    const view = this.canvas.upperCanvasEl.ownerDocument.defaultView;
    this._middleWindow = view;
    view.addEventListener('mousemove', this._middleMove, true);
    view.addEventListener('mouseup', this._middleUp, true);
    view.addEventListener('blur', this._middleBlur);
  }

  onMiddleMouseMove(event) {
    if (!(event.buttons & 4)) {
      this.stopMiddleMousePan();
      return;
    }
    event.stopImmediatePropagation();
    this.move({ e: event });
  }

  onMiddleMouseUp(event) {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.stopMiddleMousePan();
  }

  onMiddleAuxClick(event) {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  stopMiddleMousePan() {
    if (!this._middleWindow) return;
    const view = this._middleWindow;
    this._middleWindow = null;
    view.removeEventListener('mousemove', this._middleMove, true);
    view.removeEventListener('mouseup', this._middleUp, true);
    view.removeEventListener('blur', this._middleBlur);
    this.finish();
  }

  _point(evt) {
    const pointer = evt.touches?.[0] || evt.changedTouches?.[0] || evt;
    return { x: pointer.clientX, y: pointer.clientY };
  }

  start(opt) {
    if (!this.active || this.dragging) return false;
    this.canvas.selection = false;
    return this._begin(opt.e);
  }

  startMiddle(event) {
    if (event.button !== 1 || this.dragging) return false;
    return this._begin(event);
  }

  _begin(event) {
    event.preventDefault();
    const point = this._point(event);
    this.dragging = true;
    this.lastX = point.x;
    this.lastY = point.y;
    this.onStart();
    return true;
  }

  move(opt) {
    if (!this.dragging) return;
    const evt = opt.e;
    evt.preventDefault();
    const point = this._point(evt);
    const transform = this.canvas.viewportTransform;
    transform[4] += point.x - this.lastX;
    transform[5] += point.y - this.lastY;
    this.lastX = point.x;
    this.lastY = point.y;
    this.canvas.requestRenderAll();
  }

  finish() {
    if (!this.dragging) return false;
    this.dragging = false;
    this.onFinish();
    return true;
  }

  deactivate() {
    if (!this.active) return;
    // Changing tools must not interrupt a middle-button drag.
    if (!this._middleWindow) this.finish();
    for (const [event, listener] of this._listeners()) this.canvas.off(event, listener);
    this.active = false;
  }

  isActive() {
    return this.dragging;
  }

  dispose() {
    this.disableMiddleMouse();
    this.deactivate();
  }
}
