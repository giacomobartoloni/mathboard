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
  constructor({ canvas, onStart = () => {}, onFinish = () => {} }) {
    this.canvas = canvas;
    this.onStart = onStart;
    this.onFinish = onFinish;
    this.active = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this._down = (opt) => this.start(opt);
    this._move = (opt) => this.move(opt);
    this._up = () => this.finish();
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

  _point(evt) {
    const pointer = evt.touches?.[0] || evt.changedTouches?.[0] || evt;
    return { x: pointer.clientX, y: pointer.clientY };
  }

  start(opt) {
    if (!this.active) return;
    const evt = opt.e;
    evt.preventDefault();
    const point = this._point(evt);
    this.dragging = true;
    this.lastX = point.x;
    this.lastY = point.y;
    this.canvas.selection = false;
    this.onStart();
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
    this.finish();
    for (const [event, listener] of this._listeners()) this.canvas.off(event, listener);
    this.active = false;
  }

  isActive() {
    return this.dragging;
  }

  dispose() {
    this.deactivate();
  }
}
