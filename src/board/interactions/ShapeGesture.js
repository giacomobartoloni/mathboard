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

import { Rect, Circle, Line } from "fabric";

const LEFT_TOP_ORIGIN = { originX: "left", originY: "top" };

/** Retains the live temporary Fabric object, origin and event listeners. */
export class ShapeGesture {
  constructor({ canvas, getShape, getInk, getInkMode, onCommitted, onComplete }) {
    this.canvas = canvas;
    this.getShape = getShape;
    this.getInk = getInk;
    this.getInkMode = getInkMode;
    this.onCommitted = onCommitted;
    this.onComplete = onComplete;
    this.active = false;
    this.pending = null;
    this.origin = null;
    this.shapeType = null;
    this._down = (opt) => this.start(opt);
    this._move = (opt) => this.move(opt);
    this._up = () => this.finish(true);
  }

  createShape(x, y, type = this.getShape()) {
    const props = {
      fill: "transparent", stroke: this.getInk(), strokeWidth: 2, selectable: false,
    };
    let shape;
    if (type === "rectangle") {
      shape = new Rect({ left: x, top: y, width: 0, height: 0, ...LEFT_TOP_ORIGIN, ...props });
    } else if (type === "circle") {
      shape = new Circle({ left: x, top: y, radius: 0, ...props, originX: "center", originY: "center" });
    } else if (type === "arrow") {
      shape = new Line([x, y, x, y], { ...LEFT_TOP_ORIGIN, ...props, strokeWidth: 3 });
    } else {
      return null;
    }
    shape.mathboardInkMode = this.getInkMode();
    return shape;
  }

  _point(opt) {
    return opt.scenePoint || this.canvas.getScenePoint(opt.e);
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this.canvas.on("mouse:down", this._down);
    this.canvas.on("mouse:move", this._move);
    this.canvas.on("mouse:up", this._up);
  }

  start(opt) {
    if (!this.active || this.pending) return;
    const point = this._point(opt);
    const type = this.getShape();
    const shape = this.createShape(point.x, point.y, type);
    if (!shape) return;
    this.origin = { x: point.x, y: point.y };
    this.shapeType = type;
    this.pending = shape;
    this.canvas.add(shape);
    this.canvas.renderAll();
  }

  move(opt) {
    if (!this.pending || !this.origin) return;
    const point = this._point(opt);
    const width = point.x - this.origin.x;
    const height = point.y - this.origin.y;
    if (this.shapeType === "rectangle") {
      this.pending.set({
        width: Math.abs(width), height: Math.abs(height),
        left: width > 0 ? this.origin.x : point.x,
        top: height > 0 ? this.origin.y : point.y,
      });
    } else if (this.shapeType === "circle") {
      this.pending.set({
        radius: Math.sqrt(width * width + height * height) / 2,
        left: this.origin.x, top: this.origin.y,
        originX: "center", originY: "center",
      });
    } else if (this.shapeType === "arrow") {
      this.pending.set({ x2: point.x, y2: point.y });
    }
    this.canvas.renderAll();
  }

  finish(complete = true) {
    const shape = this.pending;
    const type = this.shapeType;
    this.pending = null;
    this.origin = null;
    this.shapeType = null;
    if (!shape) return false;
    shape.setCoords();
    this.onCommitted(shape, type);
    // A tool switch calls deactivate() and must win over a late one-shot event.
    if (complete) this.onComplete();
    return true;
  }

  deactivate() {
    if (!this.active) return;
    this.finish(false);
    this.active = false;
    this.canvas.off("mouse:down", this._down);
    this.canvas.off("mouse:move", this._move);
    this.canvas.off("mouse:up", this._up);
  }

  cancel() {
    const shape = this.pending;
    if (!shape) return false;
    this.pending = null;
    this.origin = null;
    this.shapeType = null;
    this.canvas.remove(shape);
    this.canvas.requestRenderAll();
    return true;
  }

  isActive() {
    return Boolean(this.pending);
  }

  dispose() {
    this.cancel();
    this.deactivate();
  }
}
