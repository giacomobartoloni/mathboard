<!--
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
-->

<template>
  <div id="boardcontainer">
    <canvas :id="id"></canvas>
  </div>
</template>

<script>
import { markRaw } from "vue";
import { Canvas, Pattern, PencilBrush, Shadow, Rect, Circle, Line, IText, FabricImage, filters } from "fabric";
import * as fabric from "fabric";
import fabricStaticCanvas from "./fabricStaticCanvas";
import html2canvas from "html2canvas";
import { applyAutoInk, applyExplicitInk, paletteColorFromSelection } from "../config/colors";
import { BOARD_THEMES, INK_MODE_AUTO, INK_MODE_FIXED, normalizeBoardTheme } from "../config/themes";
import {
  HISTORY_LIMIT,
  snapshotObject,
  applySnapshot,
  snapshotsEqual,
  gestureObjects,
} from "../history/commandLog";

// Objects whose board ink lives on "stroke" (pencil strokes, shapes).
// Prefer Fabric class names; isType() also accepts legacy lowercase aliases.
const STROKE_INK_TYPES = ["Path", "Rect", "Circle", "Line"];
// Objects whose board ink lives on "fill".
const FILL_INK_TYPES = ["IText", "Text"];

const FORMULA_TYPE = "katex-formula";

// Fabric 7 defaults origin to center/center; keep left/top for click-to-place UX.
const LEFT_TOP_ORIGIN = { originX: "left", originY: "top" };

// Constants
const CANVAS_EVENTS = [
  "before:render", "after:render", "canvas:cleared", "object:added", "object:removed",
  "object:modified", "object:rotated", "object:scaled", "object:moved", "object:skewed",
  "object:rotating", "object:scaling", "object:moving", "object:skewing", "before:transform",
  "before:selection:cleared", "selection:cleared", "selection:updated", "selection:created",
  "path:created", "mouse:down", "mouse:move", "mouse:up", "mouse:down:before",
  "mouse:move:before", "mouse:up:before", "mouse:over", "mouse:out", "mouse:dblclick",
  "dragover", "dragenter", "dragleave", "drop"
];

const GRID_SIZE = 40;
// Ink colors deliberately omitted: the default ink follows the active board theme
// for objects created afterwards (see boardThemeConfig().defaultInk).
const DEFAULT_BRUSH_CONFIG = {
  width: 2,
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  shadowColor: "#000000"
};

const DEFAULT_TEXT_CONFIG = {
  content: 'Text',
  fontSize: 32,
  fontFamily: 'Arial'
};

const CURSOR_TYPES = {
  grab: 'grab',
  grabbing: 'grabbing',
  default: 'default',
  move: 'move'
};

export default {
  name: "DrawBoard",
  mixins: [fabricStaticCanvas],
  props: {
    id: { type: String, required: false, default: "c" },
    selectedTool: { type: String, default: "pencil" },
    selectedShape: { type: String, default: "rectangle" },
    boardTheme: { type: String, default: "light" },
    selectedColor: { type: String, default: null },
  },
  data() {
    return {
      canvas: null,
      type: "canvas",
      windowWidth: 0,
      windowHeight: 0,
      isPanning: false,
      lastPosX: 0,
      lastPosY: 0,
      isDrawingShape: false,
      shapeStartX: 0,
      shapeStartY: 0,
      currentShape: null,
    };
  },
  provide() {
    return {
      $canvas: () => this.canvas,
      $group: () => null,
      fabric,
    };
  },
  created() {
    // The stack holds Fabric instances. It stays off Vue's reactive state so
    // those instances are not proxied.
    this._history = [];
    this._historyStep = -1;
    this._suspendHistory = false;
    this._pendingTransform = null;
    this._pendingText = null;
    this._uncommittedText = null;
    this._historyTipKind = "command";
  },
  methods: {
    fitToContainer(canvas) {
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    },
    createGridPattern() {
      const patternCanvas = document.createElement('canvas');
      const ctx = patternCanvas.getContext('2d');

      patternCanvas.width = GRID_SIZE;
      patternCanvas.height = GRID_SIZE;

      // Board theme drives the board background and grid colors.
      ctx.fillStyle = this.boardThemeConfig.background;
      ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);

      ctx.strokeStyle = this.boardThemeConfig.grid;
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, GRID_SIZE);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(GRID_SIZE, 0);
      ctx.stroke();
      
      return patternCanvas;
    },
    setBackgroundPattern() {
      const pattern = new Pattern({
        source: this.createGridPattern(),
        repeat: 'repeat'
      });
      
      this.canvas.backgroundColor = pattern;
      this.canvas.renderAll();
    },
    /**
     * Recolor every object authored with the board default ink to the given board
     * theme. Objects without the AUTO ink mode (explicit user colors, imported
     * documents) are left untouched, and no history entry is pushed.
     */
    syncAutoInk(config) {
      this.canvas.forEachObject((obj) => {
        if (obj.mathboardInkMode !== INK_MODE_AUTO) return;

        if (obj.formulaType === FORMULA_TYPE) {
          this.syncFormulaInk(obj, config);
        } else if (obj.isType(...STROKE_INK_TYPES)) {
          obj.set('stroke', config.defaultInk);
        } else if (obj.isType(...FILL_INK_TYPES)) {
          obj.set('fill', config.defaultInk);
        }
      });
    },
    /**
     * Adapt a formula bitmap to the board ink polarity. Fabric filters never mutate
     * the source element, so dropping the filter restores the original rendering.
     */
    syncFormulaInk(img, config) {
      const shouldInvert = Boolean(img.mathboardRenderedInkIsLight) !== config.inkIsLight;
      const isInverted = img.filters?.some((filter) => filter.type === 'Invert') ?? false;

      if (shouldInvert === isInverted) return;

      img.filters = shouldInvert ? [new filters.Invert()] : [];
      img.applyFilters();
    },
    markPathInk({ path }) {
      if (!path) return;
      path.mathboardInkMode = this.inkMode;
    },
    _inkSnapshot(object) {
      if (!object || object.formulaType) return null;
      if (object.isType(...STROKE_INK_TYPES)) {
        return { stroke: object.stroke, mathboardInkMode: object.mathboardInkMode };
      }
      if (object.isType(...FILL_INK_TYPES)) {
        return { fill: object.fill, mathboardInkMode: object.mathboardInkMode };
      }
      return null;
    },
    applyBrushColor() {
      if (this.canvas?.freeDrawingBrush) {
        this.canvas.freeDrawingBrush.color = this.activeInk;
      }
    },
    createEvents() {
      CANVAS_EVENTS.forEach((event) => {
        const vueEvent = event.replace(/:/g, '-');
        this.canvas.on(event, (e) => this.$emit(vueEvent, e));
      });
    },
    updateCanvasSize() {
      this.windowWidth = document.documentElement.clientWidth;
      this.windowHeight = document.documentElement.clientHeight;
      // Fabric 7 removed setWidth/setHeight; use setDimensions.
      this.canvas.setDimensions({
        width: this.windowWidth,
        height: this.windowHeight
      });
      this.canvas.renderAll();
      this.canvas.calcOffset();
    },
    getWindowWidth() {
      this.updateCanvasSize();
    },
    getWindowHeight() {
      this.updateCanvasSize();
    },
    setObjectsSelectable(selectable) {
      this.canvas.forEachObject((obj) => {
        obj.selectable = selectable;
      });
    },
    setCursor(cursor, hover = cursor) {
      this.canvas.defaultCursor = cursor;
      this.canvas.hoverCursor = hover;
      if (cursor === CURSOR_TYPES.grabbing) {
        this.canvas.setCursor(cursor);
      }
    },
    enablePanning() {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = false;
      this.setObjectsSelectable(false);
      this.setCursor(CURSOR_TYPES.grab);
      this.canvas.allowTouchScrolling = false;
      
      this.canvas.on('mouse:down', this.startPanning);
      this.canvas.on('mouse:move', this.continuePanning);
      this.canvas.on('mouse:up', this.stopPanning);
      this.canvas.on('touch:start', this.startPanning);
      this.canvas.on('touch:move', this.continuePanning);
      this.canvas.on('touch:end', this.stopPanning);
    },
    disablePanning() {
      this.canvas.off('mouse:down', this.startPanning);
      this.canvas.off('mouse:move', this.continuePanning);
      this.canvas.off('mouse:up', this.stopPanning);
      this.canvas.off('touch:start', this.startPanning);
      this.canvas.off('touch:move', this.continuePanning);
      this.canvas.off('touch:end', this.stopPanning);
      
      this.setCursor(CURSOR_TYPES.default, CURSOR_TYPES.move);
      this.canvas.selection = true;
      this.setObjectsSelectable(true);
      this.canvas.allowTouchScrolling = true;
    },
    startPanning(opt) {
      if (this.selectedTool !== 'pan') return;
      
      const evt = opt.e;
      evt.preventDefault();
      this.isPanning = true;
      this.lastPosX = evt.touches ? evt.touches[0].clientX : evt.clientX;
      this.lastPosY = evt.touches ? evt.touches[0].clientY : evt.clientY;
      this.canvas.selection = false;
      this.setCursor(CURSOR_TYPES.grabbing);
    },
    continuePanning(opt) {
      if (!this.isPanning) return;
      const evt = opt.e;
      evt.preventDefault();
      const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
      const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
      const vpt = this.canvas.viewportTransform;
      vpt[4] += clientX - this.lastPosX;
      vpt[5] += clientY - this.lastPosY;
      this.canvas.requestRenderAll();
      this.lastPosX = clientX;
      this.lastPosY = clientY;
    },
    stopPanning() {
      this.isPanning = false;
      if (this.selectedTool === 'pan') {
        this.setCursor(CURSOR_TYPES.grab);
      }
    },
    enableTextInsertion() {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = true;
      this.setObjectsSelectable(true);
      this.canvas.on('mouse:down', this.addText);
    },
    disableTextInsertion() {
      this.canvas.off('mouse:down', this.addText);
    },
    enableFormulaInsertion() {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = true;
      this.setObjectsSelectable(true);
      this.canvas.on('mouse:down', this.requestFormulaInput);
    },
    disableFormulaInsertion() {
      this.canvas.off('mouse:down', this.requestFormulaInput);
    },
    requestFormulaInput(opt) {
      if (this.selectedTool !== 'formula' || opt.target) return;
      
      const pointer = opt.scenePoint || this.canvas.getScenePoint(opt.e);
      this.$emit('request-formula', { x: pointer.x, y: pointer.y });
    },
    _buildFormulaImage(formulaData, position) {
      // Create a temporary div to render the formula
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.fontSize = '15px';
      tempDiv.style.padding = '10px';
      tempDiv.style.backgroundColor = 'transparent';
      // The bitmap is rendered with the active board ink; it is marked as auto
      // so theme switches can adapt it (rasterized text cannot be recolored).
      tempDiv.style.color = this.boardThemeConfig.defaultInk;
      tempDiv.innerHTML = formulaData.html;
      document.body.appendChild(tempDiv);

      return new Promise((resolve) => {
        this.$nextTick(() => {
          setTimeout(async () => {
            try {
              // Use html2canvas to convert the div to a canvas
              const renderedCanvas = await html2canvas(tempDiv, {
                backgroundColor: null,
                scale: 2, // Higher quality
                logging: false
              });

              // Create fabric image directly from the canvas element
              const img = new FabricImage(renderedCanvas, {
                left: position.x,
                top: position.y,
                ...LEFT_TOP_ORIGIN,
                selectable: true,
                evented: true,
                hasControls: true,
                hasBorders: true,
                lockMovementX: false,
                lockMovementY: false,
                lockRotation: false,
                lockScalingX: false,
                lockScalingY: false,
                lockScalingFlip: false,
                lockSkewingX: false,
                lockSkewingY: false
              });

              // Store latex data as custom property
              img.latex = formulaData.latex;
              img.formulaType = FORMULA_TYPE;
              // Auto ink: follow the board theme. The polarity recorded here is the
              // one the bitmap was rasterized with, so later board changes can decide
              // whether an Invert filter is needed.
              img.mathboardInkMode = INK_MODE_AUTO;
              img.mathboardRenderedInkIsLight = this.boardThemeConfig.inkIsLight;

              if (tempDiv.parentNode) {
                document.body.removeChild(tempDiv);
              }
              resolve(img);
            } catch (error) {
              console.error('Error adding formula:', error);
              if (tempDiv.parentNode) {
                document.body.removeChild(tempDiv);
              }
              resolve(null);
            }
          }, 100);
        });
      });
    },
    async addFormulaToCanvas(formulaData, position) {
      const img = await this._buildFormulaImage(formulaData, position);
      if (!img || !this.canvas) return;

      this.canvas.add(img);
      this.canvas.setActiveObject(img);
      this.canvas.requestRenderAll();
      this._recordAdd(img);
    },
    async replaceFormula(existing, formulaData) {
      if (!existing || !this.canvas) return;

      // Read canvas coordinates before the bitmap is ready. A selected formula
      // may still be in group space; the snapshot converts and restores it.
      const placed = snapshotObject(existing);
      const img = await this._buildFormulaImage(formulaData, {
        x: placed.left,
        y: placed.top
      });
      if (!img || !this.canvas || !this.canvas.getObjects().includes(existing)) return;

      // The bitmap is built asynchronously. Place it where the formula is now.
      const current = snapshotObject(existing);
      img.set({ left: current.left, top: current.top });
      const index = this.canvas.getObjects().indexOf(existing);
      this._suspendHistory = true;
      try {
        this._removeRetained(existing);
        this._insertRetained(img, index);
      } finally {
        this._suspendHistory = false;
      }
      this.canvas.setActiveObject(img);
      this.canvas.requestRenderAll();
      this._pushCommand({
        type: 'replace',
        index,
        removed: existing,
        added: img
      });
    },
    enableShapeDrawing() {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = false;
      this.setObjectsSelectable(false);
      
      this.canvas.on('mouse:down', this.startDrawingShape);
      this.canvas.on('mouse:move', this.continueDrawingShape);
      this.canvas.on('mouse:up', this.finishDrawingShape);
    },
    disableShapeDrawing() {
      // Tool switches drop the mouse-up listener. Close the gesture first so
      // the shape still has one command.
      this.finishDrawingShape();
      this.canvas.off('mouse:down', this.startDrawingShape);
      this.canvas.off('mouse:move', this.continueDrawingShape);
      this.canvas.off('mouse:up', this.finishDrawingShape);
      
      this.canvas.selection = true;
      this.setObjectsSelectable(true);
    },
    startDrawingShape(opt) {
      if (this.selectedTool !== 'shapes') return;
      
      const pointer = opt.scenePoint || this.canvas.getScenePoint(opt.e);
      this.isDrawingShape = true;
      this.shapeStartX = pointer.x;
      this.shapeStartY = pointer.y;
      
      // Crea la forma iniziale
      this.currentShape = this.createShape(pointer.x, pointer.y, 0, 0);
      this.canvas.add(this.currentShape);
      this.canvas.renderAll();
    },
    continueDrawingShape(opt) {
      if (!this.isDrawingShape || !this.currentShape) return;
      
      const pointer = opt.scenePoint || this.canvas.getScenePoint(opt.e);
      const width = pointer.x - this.shapeStartX;
      const height = pointer.y - this.shapeStartY;
      
      // Aggiorna la forma in base al tipo
      if (this.selectedShape === 'rectangle') {
        this.currentShape.set({
          width: Math.abs(width),
          height: Math.abs(height),
          left: width > 0 ? this.shapeStartX : pointer.x,
          top: height > 0 ? this.shapeStartY : pointer.y
        });
      } else if (this.selectedShape === 'circle') {
        const radius = Math.sqrt(width * width + height * height) / 2;
        this.currentShape.set({
          radius: radius,
          left: this.shapeStartX,
          top: this.shapeStartY,
          originX: 'center',
          originY: 'center'
        });
      } else if (this.selectedShape === 'arrow') {
        this.currentShape.set({
          x2: pointer.x,
          y2: pointer.y
        });
      }
      
      this.canvas.renderAll();
    },
    finishDrawingShape() {
      const shape = this.currentShape;
      this.isDrawingShape = false;
      this.currentShape = null;
      // One gesture, including a click that leaves a 0×0 shape. The add at
      // mouse-down is not a command; object:added is not a history hook.
      if (shape) this._recordAdd(shape);
    },
    createShape(x, y, width, height) {
      const commonProps = {
        fill: 'transparent',
        stroke: this.activeInk,
        strokeWidth: 2,
        selectable: true
      };
      
      let shape;
      if (this.selectedShape === 'rectangle') {
        shape = new Rect({
          left: x,
          top: y,
          width: width,
          height: height,
          ...LEFT_TOP_ORIGIN,
          ...commonProps
        });
      } else if (this.selectedShape === 'circle') {
        shape = new Circle({
          left: x,
          top: y,
          radius: 0,
          ...commonProps,
          originX: 'center',
          originY: 'center'
        });
      } else if (this.selectedShape === 'arrow') {
        shape = new Line([x, y, x, y], {
          ...LEFT_TOP_ORIGIN,
          ...commonProps,
          strokeWidth: 3
        });
      }

      // Explicit palette ink stays fixed. Automatic ink still follows the board theme.
      shape.mathboardInkMode = this.inkMode;
      return shape;
    },
    addText(opt) {
      if (this.selectedTool !== 'font' || opt.target) return;
      
      const pointer = opt.scenePoint || this.canvas.getScenePoint(opt.e);
      const text = new IText(DEFAULT_TEXT_CONFIG.content, {
        left: pointer.x,
        top: pointer.y,
        ...LEFT_TOP_ORIGIN,
        fontSize: DEFAULT_TEXT_CONFIG.fontSize,
        fill: this.activeInk,
        fontFamily: DEFAULT_TEXT_CONFIG.fontFamily,
        editable: true,
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        lockMovementX: false,
        lockMovementY: false,
        lockRotation: false,
        lockScalingX: false,
        lockScalingY: false,
        lockScalingFlip: false,
        lockSkewingX: false,
        lockSkewingY: false
      });
      
      // Explicit palette ink stays fixed. Automatic ink still follows the board theme.
      // The placeholder is not a command. The add is recorded when editing
      // exits with real text; an empty or unchanged placeholder is removed.
      text.mathboardInkMode = this.inkMode;
      this._uncommittedText = text;
      
      this.canvas.add(text);
      this.canvas.setActiveObject(text);
      
      // Enter editing mode immediately
      this.$nextTick(() => {
        text.enterEditing();
        text.selectAll();
        text.hiddenTextarea?.focus();
      });
      
      // When exiting edit mode, clean up empty text or notify parent to switch to select tool
      text.on('editing:exited', () => {
        this._uncommittedText = null;
        if (text.text.trim() === '' || text.text === DEFAULT_TEXT_CONFIG.content) {
          this._removeRetained(text);
        } else {
          this._recordAdd(text);
        }
        this.canvas.requestRenderAll();
        
        // Disabilita immediatamente il text insertion per evitare creazione di nuovo testo
        this.disableTextInsertion();
        
        // Emit event to switch to select tool
        this.$emit('text-editing-completed');
      });
    },
    /**
     * Mirror the active selection into the toolbar palette. Automatic ink
     * emits null; fixed ink emits its hex. Mixed or unreadable selections
     * leave the palette alone. Does not recolor or push history.
     */
    emitSelectionColor() {
      if (!this.canvas) return;
      const active = this.canvas.getActiveObject();
      if (!active) return;

      const targets = active.isType("ActiveSelection")
        ? active.getObjects()
        : [active];
      const color = paletteColorFromSelection(targets);
      if (color === undefined) return;
      this.$emit("selection-color", color);
    },

    /**
     * Recolor the active selection. A hex locks explicit ink; null restores
     * automatic board ink. Unselected objects are not visited. A custom-color
     * drag coalesces into one history entry; a swatch click is its own undo step.
     */
    recolorSelection(color, options = {}) {
      if (!this.canvas) return false;
      const active = this.canvas.getActiveObject();
      if (!active) return false;

      const targets = active.isType("ActiveSelection")
        ? active.getObjects()
        : [active];

      const useAuto = color === null;
      const ink = useAuto ? this.boardThemeConfig.defaultInk : color;

      const entries = [];
      targets.forEach((obj) => {
        const before = this._inkSnapshot(obj);
        if (!before) return;
        const applied = useAuto
          ? applyAutoInk(obj, ink)
          : applyExplicitInk(obj, ink);
        if (!applied) return;
        entries.push({ object: obj, before, after: this._inkSnapshot(obj) });
      });
      if (entries.length === 0) return false;

      if (active.isType("ActiveSelection")) active.set("dirty", true);

      const coalesce = Boolean(options.coalesce);
      const tip = this._history[this._historyStep];
      const replaceTip = coalesce
        && this._historyTipKind === "recolor-coalesce"
        && tip
        && tip.type === "recolor"
        && this._historyStep === this._history.length - 1;
      if (replaceTip) {
        const byObject = new Map(tip.entries.map((entry) => [entry.object, entry]));
        entries.forEach((entry) => {
          const existing = byObject.get(entry.object);
          if (existing) existing.after = entry.after;
          else tip.entries.push(entry);
        });
      } else {
        this._pushCommand({ type: "recolor", entries });
        if (coalesce) this._historyTipKind = "recolor-coalesce";
      }
      this.canvas.requestRenderAll();
      return true;
    },

    deleteSelection() {
      if (!this.canvas) return;
      const active = this.canvas.getActiveObject();
      if (!active || active.isEditing) return;

      // An ActiveSelection is not in canvas._objects, so removing it leaves
      // the children in place. Delete the children, one command for the gesture.
      const objects = this.canvas.getActiveObjects();
      if (!objects.length) return;

      const entries = objects
        .map((object) => ({
          object,
          index: this.canvas.getObjects().indexOf(object)
        }))
        .filter((entry) => entry.index >= 0)
        .sort((a, b) => a.index - b.index);
      if (!entries.length) return;

      this.canvas.discardActiveObject();
      entries.forEach(({ object }) => this.canvas.remove(object));
      this.canvas.requestRenderAll();
      this._pushCommand({ type: 'delete', entries });
    },
    isTextEditing() {
      const active = this.canvas?.getActiveObject();
      return Boolean(active && active.isEditing);
    },
    exitTextEditing() {
      const active = this.canvas?.getActiveObject();
      if (!active?.isEditing) return false;
      active.exitEditing();
      return true;
    },
    cancelInProgressShape() {
      if (!this.isDrawingShape || !this.currentShape || !this.canvas) return false;
      const shape = this.currentShape;
      this.isDrawingShape = false;
      this.currentShape = null;
      // The add is recorded only when the gesture finishes, so cancelling
      // removes the shape and leaves the command log untouched.
      this._suspendHistory = true;
      try {
        this.canvas.remove(shape);
      } finally {
        this._suspendHistory = false;
      }
      this.canvas.requestRenderAll();
      return true;
    },
    clearSelection() {
      if (!this.canvas?.getActiveObject()) return false;
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
      return true;
    },
    cancelTransientAction() {
      if (this.cancelInProgressShape()) return true;
      return this.clearSelection();
    },
    _pushCommand(command) {
      if (this._suspendHistory) return;

      this._history.splice(this._historyStep + 1);
      this._history.push(command);
      this._historyStep = this._history.length - 1;

      if (this._history.length > HISTORY_LIMIT) {
        this._history.shift();
        this._historyStep--;
      }
      this._historyTipKind = "command";
    },
    _recordAdd(object) {
      if (!object || !this.canvas) return;
      const index = this.canvas.getObjects().indexOf(object);
      if (index < 0) return;
      this._pushCommand({ type: 'add', object, index });
    },
    _insertRetained(object, index) {
      if (!object || this.canvas.getObjects().includes(object)) return;
      const at = Math.max(0, Math.min(index, this.canvas.getObjects().length));
      this.canvas.insertAt(at, object);
    },
    _selectionHolds(object) {
      const active = this.canvas.getActiveObject();
      if (!active) return false;
      if (active === object) return true;
      return active.isType('ActiveSelection') && active.getObjects().includes(object);
    },
    _removeRetained(object) {
      if (!object || !this.canvas.getObjects().includes(object)) return;
      if (this._selectionHolds(object)) {
        this.canvas.discardActiveObject();
      }
      this.canvas.remove(object);
    },
    _applyCommand(command, direction) {
      const canvas = this.canvas;
      const previous = canvas.renderOnAddRemove;
      canvas.renderOnAddRemove = false;
      try {
        if (command.type === 'add') {
          if (direction === 'forward') this._insertRetained(command.object, command.index);
          else this._removeRetained(command.object);
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
    },
    _runHistory(direction) {
      if (!this.canvas) return;
      if (direction === 'undo' && this._historyStep < 0) return;
      if (direction === 'redo' && this._historyStep >= this._history.length - 1) return;

      const index = direction === 'undo' ? this._historyStep : this._historyStep + 1;
      const command = this._history[index];
      this._pendingTransform = null;
      this._pendingText = null;
      this._suspendHistory = true;
      try {
        this._applyCommand(command, direction === 'undo' ? 'inverse' : 'forward');
        this._historyStep = direction === 'undo' ? index - 1 : index;
      } finally {
        this._suspendHistory = false;
      }
      this.canvas.requestRenderAll();
    },
    undo() {
      this._runHistory('undo');
    },
    redo() {
      this._runHistory('redo');
    },
    onPathCreated({ path }) {
      this._recordAdd(path);
    },
    onBeforeTransform({ transform }) {
      if (this._suspendHistory || !transform || !transform.target) return;
      // A text edit commits on exit, before a later drag can start. Drop a
      // snapshot left behind by an edit that did not change the text.
      this._pendingText = null;
      this._pendingTransform = gestureObjects(transform.target).map((object) => ({
        object,
        before: snapshotObject(object)
      }));
    },
    onTextEditingEntered({ target }) {
      if (!target || target === this._uncommittedText) return;
      this._pendingText = { object: target, before: snapshotObject(target) };
    },
    onObjectModified(opt) {
      if (this._suspendHistory || !opt) return;

      if (opt.transform) {
        const pending = this._pendingTransform;
        this._pendingTransform = null;
        if (!pending) return;
        const entries = pending
          .map(({ object, before }) => ({
            object,
            before,
            after: snapshotObject(object)
          }))
          .filter((entry) => !snapshotsEqual(entry.before, entry.after));
        if (entries.length) this._pushCommand({ type: 'modify', entries });
        return;
      }

      const pendingText = this._pendingText;
      if (!pendingText || pendingText.object !== opt.target) return;
      this._pendingText = null;
      const after = snapshotObject(opt.target);
      if (snapshotsEqual(pendingText.before, after)) return;
      this._pushCommand({
        type: 'modify',
        entries: [{ object: opt.target, before: pendingText.before, after }]
      });
    },
    zoomIn() {
      const currentZoom = this.canvas.getZoom();
      const newZoom = currentZoom * 1.1;
      if (newZoom > 5) return; // Limite massimo di zoom
      this.canvas.setZoom(newZoom);
      this.canvas.requestRenderAll();
    },
    zoomOut() {
      const currentZoom = this.canvas.getZoom();
      const newZoom = currentZoom / 1.1;
      if (newZoom < 0.1) return; // Limite minimo di zoom
      this.canvas.setZoom(newZoom);
      this.canvas.requestRenderAll();
    },
    resetZoom() {
      this.canvas.setZoom(1);
      this.canvas.viewportTransform[4] = 0; // Reset pan X
      this.canvas.viewportTransform[5] = 0; // Reset pan Y
      this.canvas.requestRenderAll();
    },
    getZoom() {
      return this.canvas.getZoom();
    },
    initializeBrush() {
      const brush = new PencilBrush(this.canvas);
      // Explicit palette ink wins; otherwise new strokes follow the board theme.
      brush.color = this.activeInk;
      brush.width = DEFAULT_BRUSH_CONFIG.width;
      brush.shadow = new Shadow({
        blur: DEFAULT_BRUSH_CONFIG.shadowBlur,
        offsetX: DEFAULT_BRUSH_CONFIG.shadowOffsetX,
        offsetY: DEFAULT_BRUSH_CONFIG.shadowOffsetY,
        affectStroke: true,
        color: DEFAULT_BRUSH_CONFIG.shadowColor,
      });
      this.canvas.freeDrawingBrush = brush;
    },
    setupEventListeners() {
      // Pencil strokes are Path objects built by the brush. "before:path:created"
      // fires before the path is added, so the ink mode is set on that instance.
      // The command is the finished path, recorded once "path:created" fires.
      this.canvas.on('before:path:created', this.markPathInk);
      this.canvas.on('path:created', this.onPathCreated);
      this.canvas.on('before:transform', this.onBeforeTransform);
      this.canvas.on('object:modified', this.onObjectModified);
      this.canvas.on('text:editing:entered', this.onTextEditingEntered);
      
      this.canvas.on('selection:created', this.emitSelectionColor);
      this.canvas.on('selection:updated', this.emitSelectionColor);

      // Enable double-click editing for text objects and formulas
      this.canvas.on('mouse:dblclick', (opt) => {
        const target = opt.target;
        if (target && target.isType(...FILL_INK_TYPES) && target.editable) {
          target.enterEditing();
          target.selectAll();
        } else if (target && target.formulaType === FORMULA_TYPE) {
          // Edit formula
          this.$emit('edit-formula', { 
            latex: target.latex, 
            position: { x: target.left, y: target.top },
            fabricObject: target
          });
        }
      });
      
      window.addEventListener('resize', this.updateCanvasSize);
    },
    initializeCanvas() {
      const canvasElement = document.querySelector('canvas');
      this.fitToContainer(canvasElement);
      
      // data() would deep-proxy the canvas and wrap every added object. indexOf
      // on the raw instance then misses, and the add command is dropped.
      this.canvas = markRaw(new Canvas(this.id, {
        ...this.definedProps,
      }));
      
      this.initializeBrush();
      this.setBackgroundPattern();
      this.createEvents();
      this.setupEventListeners();
    },
  },
  computed: {
    boardThemeConfig() {
      return BOARD_THEMES[normalizeBoardTheme(this.boardTheme)];
    },
    activeInk() {
      return this.selectedColor || this.boardThemeConfig.defaultInk;
    },
    inkMode() {
      return this.selectedColor ? INK_MODE_FIXED : INK_MODE_AUTO;
    },
    definedProps() {
      const obj = { ...this.$props };
      // boardTheme is a presentation-only prop; it must never reach the Fabric
      // Canvas constructor options.
      delete obj.boardTheme;
      delete obj.selectedColor;
      Object.keys(obj).forEach((key) => {
        if (obj[key] === undefined) {
          delete obj[key];
        }
      });
      return obj;
    },
  },
  mounted() {
    this.initializeCanvas();
    
    this.$nextTick(() => {
      this.updateCanvasSize();
      
      if (this.selectedTool === 'select') {
        this.canvas.isDrawingMode = false;
        this.canvas.selection = true;
      }
    });
  },
  beforeUnmount() {
    CANVAS_EVENTS.forEach((event) => {
      this.canvas.off(event);
    });
    
    this.canvas.off('before:path:created', this.markPathInk);
    this.canvas.off('path:created', this.onPathCreated);
    this.canvas.off('before:transform', this.onBeforeTransform);
    this.canvas.off('object:modified', this.onObjectModified);
    this.canvas.off('text:editing:entered', this.onTextEditingEntered);
    this.canvas.off('selection:created', this.emitSelectionColor);
    this.canvas.off('selection:updated', this.emitSelectionColor);
    
    window.removeEventListener('resize', this.updateCanvasSize);
  },
  watch: {
    // Shallow on purpose. A deep watch traverses the whole Fabric graph and
    // re-runs on pan, undo, and every proxied mutation. Nothing consumes the
    // nested fields; canvas-updated only signals that the instance changed.
    canvas() {
      this.$emit('canvas-updated', this.canvas);
    },
    height(newValue) {
      this.canvas.setDimensions({ height: newValue });
      this.canvas.renderAll();
      this.canvas.calcOffset();
    },
    width(newValue) {
      this.canvas.setDimensions({ width: newValue });
      this.canvas.renderAll();
      this.canvas.calcOffset();
    },
    selectedColor() {
      // Brush only. The current selection is recolored from the palette event,
      // including a second click on the color that is already active.
      this.applyBrushColor();
    },
    boardTheme() {
      if (!this.canvas) return;
      
      // Presentation-only update: repaint the grid/background, refresh the brush
      // ink for FUTURE strokes and recolor the objects authored with the board
      // default ink. Explicitly colored objects are never touched and no history
      // entry is pushed.
      this.setBackgroundPattern();
      this.applyBrushColor();
      this.syncAutoInk(this.boardThemeConfig);
      this.canvas.requestRenderAll();
    },
    selectedTool(newTool) {
      if (!this.canvas) return;
      
      this.disablePanning();
      this.disableTextInsertion();
      this.disableShapeDrawing();
      this.disableFormulaInsertion();
      
      switch(newTool) {
        case 'select':
          this.canvas.isDrawingMode = false;
          this.canvas.selection = true;
          this.setObjectsSelectable(true);
          // Keep text objects editable
          this.canvas.forEachObject((obj) => {
            if (obj.isType(...FILL_INK_TYPES)) {
              obj.editable = true;
            }
          });
          break;
        case 'pan':
          this.enablePanning();
          break;
        case 'pencil':
          this.canvas.isDrawingMode = true;
          this.canvas.selection = false;
          break;
        case 'font':
          this.canvas.isDrawingMode = false;
          this.enableTextInsertion();
          break;
        case 'formula':
          this.canvas.isDrawingMode = false;
          this.enableFormulaInsertion();
          break;
        case 'shapes':
          this.enableShapeDrawing();
          break;
      }
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style>
div#boardcontainer {
  background: red;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: -1000;
}
canvas {
  width: 100%;
  height: 100%;
}
</style>
