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

import { Point } from 'fabric';
import { effectiveGridStep, snapDragAnchor } from '../geometry/gridSnap.js';

/**
 * Snap only Fabric's human drag action, after raw pointer translation and
 * before object:modified records the gesture. Never alter children of Groups
 * or temporary ActiveSelections, and never inspect unrelated canvas objects.
 */
export class GridSnapDrag {
  constructor({ canvas, isEnabled }) {
    this.canvas = canvas;
    this.isEnabled = isEnabled;
    this.clear();
  }

  begin(transform) {
    this.clear();
    const target = transform?.target;
    if (!this.isEnabled() || transform?.action !== 'drag'
      || !target || target.isEditing) return;
    const bounds = target.getBoundingRect();
    if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.top)) return;
    this.session = {
      target,
      startX: bounds.left,
      startY: bounds.top,
      step: null,
      latchX: null,
      latchY: null,
    };
  }

  move({ target, e } = {}) {
    const current = this.session;
    if (!current || target !== current.target) return false;
    if (!this.isEnabled() || target.isEditing || e?.altKey) {
      current.latchX = null;
      current.latchY = null;
      return false;
    }

    const bounds = target.getBoundingRect();
    if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.top)) return false;
    // Fabric may announce a transform even for an unchanged pointer.
    if (Math.abs(bounds.left - current.startX) < 1e-7
      && Math.abs(bounds.top - current.startY) < 1e-7) return false;

    const zoom = this.canvas.getZoom();
    const step = effectiveGridStep({ zoom });
    if (step !== current.step) {
      current.latchX = null;
      current.latchY = null;
      current.step = step;
    }
    if (step === null) return false;

    const snap = snapDragAnchor({
      x: bounds.left,
      y: bounds.top,
      step,
      zoom,
      latchX: current.latchX,
      latchY: current.latchY,
    });
    current.latchX = snap.latchX;
    current.latchY = snap.latchY;
    if (!snap.dx && !snap.dy) return false;

    const position = target.getXY();
    // Fabric's position/origin helpers require a real Point (not a plain { x, y }).
    target.setXY(new Point(position.x + snap.dx, position.y + snap.dy));
    target.setCoords();
    return true;
  }

  clear() {
    this.session = null;
  }
}
