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
import { Canvas, Pattern, PencilBrush, Shadow, Rect, Circle, Line, IText, util, FabricImage } from "fabric";
import * as fabric from "fabric";
import fabricStaticCanvas from "./fabricStaticCanvas";
import html2canvas from "html2canvas";

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
const HISTORY_LIMIT = 50;
const DEFAULT_BRUSH_CONFIG = {
  color: "#000000",
  width: 2,
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  shadowColor: "#000000"
};

const DEFAULT_TEXT_CONFIG = {
  content: 'Text',
  fontSize: 32,
  fill: '#000000',
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
      history: [],
      historyStep: 0,
      isRedoing: false,
      isUndoing: false,
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
      
      ctx.fillStyle = '#f9f9f9';
      ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
      
      ctx.strokeStyle = '#e0e0e0';
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
    createEvents() {
      CANVAS_EVENTS.forEach((event) => {
        const vueEvent = event.replace(/:/g, '-');
        this.canvas.on(event, (e) => this.$emit(vueEvent, e));
      });
    },
    updateCanvasSize() {
      this.windowWidth = document.documentElement.clientWidth;
      this.windowHeight = document.documentElement.clientHeight;
      this.canvas.setWidth(this.windowWidth);
      this.canvas.setHeight(this.windowHeight);
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
      
      const pointer = this.canvas.getPointer(opt.e);
      console.log('Requesting formula at position:', pointer);
      this.$emit('request-formula', { x: pointer.x, y: pointer.y });
    },
    addFormulaToCanvas(formulaData, position) {
      console.log('addFormulaToCanvas called with:', formulaData, position);
      
      // Create a temporary div to render the formula
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.fontSize = '15px';
      tempDiv.style.padding = '10px';
      tempDiv.style.backgroundColor = 'transparent';
      tempDiv.innerHTML = formulaData.html;
      document.body.appendChild(tempDiv);
      
      // Wait for rendering
      this.$nextTick(() => {
        setTimeout(async () => {
          try {
            console.log('Rendering formula with html2canvas...');
            
            // Use html2canvas to convert the div to a canvas
            const renderedCanvas = await html2canvas(tempDiv, {
              backgroundColor: null,
              scale: 2, // Higher quality
              logging: false
            });
            
            console.log('Canvas rendered:', renderedCanvas.width, 'x', renderedCanvas.height);
            
            // Create fabric image directly from the canvas element
            const img = new FabricImage(renderedCanvas, {
              left: position.x,
              top: position.y,
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
            
            console.log('Fabric image created:', img.width, 'x', img.height);
            console.log('Image controls:', img.hasControls, 'hasBorders:', img.hasBorders);
            
            // Store latex data as custom property
            img.latex = formulaData.latex;
            img.formulaType = 'katex-formula';
            
            this.canvas.add(img);
            this.canvas.setActiveObject(img);
            this.canvas.requestRenderAll();
            
            console.log('Active object:', this.canvas.getActiveObject());
            
            console.log('Formula added successfully to canvas');
            
            // Clean up
            document.body.removeChild(tempDiv);
            
          } catch (error) {
            console.error('Error adding formula:', error);
            if (tempDiv.parentNode) {
              document.body.removeChild(tempDiv);
            }
          }
        }, 100);
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
      this.canvas.off('mouse:down', this.startDrawingShape);
      this.canvas.off('mouse:move', this.continueDrawingShape);
      this.canvas.off('mouse:up', this.finishDrawingShape);
      
      this.canvas.selection = true;
      this.setObjectsSelectable(true);
    },
    startDrawingShape(opt) {
      if (this.selectedTool !== 'shapes') return;
      
      const pointer = this.canvas.getPointer(opt.e);
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
      
      const pointer = this.canvas.getPointer(opt.e);
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
      this.isDrawingShape = false;
      this.currentShape = null;
    },
    createShape(x, y, width, height) {
      const commonProps = {
        fill: 'transparent',
        stroke: '#000000',
        strokeWidth: 2,
        selectable: true
      };
      
      if (this.selectedShape === 'rectangle') {
        return new Rect({
          left: x,
          top: y,
          width: width,
          height: height,
          ...commonProps
        });
      } else if (this.selectedShape === 'circle') {
        return new Circle({
          left: x,
          top: y,
          radius: 0,
          ...commonProps,
          originX: 'center',
          originY: 'center'
        });
      } else if (this.selectedShape === 'arrow') {
        return new Line([x, y, x, y], {
          ...commonProps,
          strokeWidth: 3
        });
      }
    },
    addText(opt) {
      if (this.selectedTool !== 'font' || opt.target) return;
      
      const pointer = this.canvas.getPointer(opt.e);
      const text = new IText(DEFAULT_TEXT_CONFIG.content, {
        left: pointer.x,
        top: pointer.y,
        fontSize: DEFAULT_TEXT_CONFIG.fontSize,
        fill: DEFAULT_TEXT_CONFIG.fill,
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
        if (text.text.trim() === '' || text.text === DEFAULT_TEXT_CONFIG.content) {
          this.canvas.remove(text);
        }
        this.canvas.requestRenderAll();
        
        // Disabilita immediatamente il text insertion per evitare creazione di nuovo testo
        this.disableTextInsertion();
        
        // Emit event to switch to select tool
        this.$emit('text-editing-completed');
      });
    },
    handleDelete(activeObject) {
      if (!activeObject) return;
      
      // Don't delete if text is being edited
      if (activeObject.isEditing) {
        return;
      }
      
      this.canvas.remove(activeObject);
      this.canvas.requestRenderAll();
    },
    isUndoShortcut(e) {
      return (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey;
    },
    isRedoShortcut(e) {
      return (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey));
    },
    handleKeyDown(e) {
      // Don't interfere with input fields or textareas
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      
      const activeObject = this.canvas.getActiveObject();
      
      // Don't interfere with text editing on canvas
      if (activeObject && activeObject.isEditing) {
        return;
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.handleDelete(activeObject);
      } else if (this.isUndoShortcut(e)) {
        e.preventDefault();
        this.undo();
      } else if (this.isRedoShortcut(e)) {
        e.preventDefault();
        this.redo();
      }
    },
    saveState() {
      if (this.isUndoing || this.isRedoing) return;
      
      const json = JSON.stringify(this.canvas.toJSON(['objects']));
      
      if (this.historyStep < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyStep + 1);
      }
      
      this.history.push(json);
      this.historyStep = this.history.length - 1;
      
      if (this.history.length > HISTORY_LIMIT) {
        this.history.shift();
        this.historyStep--;
      }
    },
    async loadHistoryState(state) {
      // Remove all objects but preserve background
      const objects = this.canvas.getObjects();
      objects.forEach(obj => this.canvas.remove(obj));
      
      if (state.objects && state.objects.length > 0) {
        const enlivenedObjects = await util.enlivenObjects(state.objects);
        enlivenedObjects.forEach(obj => this.canvas.add(obj));
      }
      
      this.canvas.renderAll();
    },
    async undo() {
      if (this.historyStep <= 0) return;
      
      this.isUndoing = true;
      this.historyStep--;
      await this.loadHistoryState(JSON.parse(this.history[this.historyStep]));
      this.isUndoing = false;
    },
    async redo() {
      if (this.historyStep >= this.history.length - 1) return;
      
      this.isRedoing = true;
      this.historyStep++;
      await this.loadHistoryState(JSON.parse(this.history[this.historyStep]));
      this.isRedoing = false;
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
      brush.color = DEFAULT_BRUSH_CONFIG.color;
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
      this.canvas.on('object:added', this.saveState);
      this.canvas.on('object:modified', this.saveState);
      this.canvas.on('object:removed', this.saveState);
      
      // Enable double-click editing for text objects and formulas
      this.canvas.on('mouse:dblclick', (opt) => {
        const target = opt.target;
        if (target && (target.type === 'i-text' || target.type === 'text') && target.editable) {
          target.enterEditing();
          target.selectAll();
        } else if (target && target.formulaType === 'katex-formula') {
          // Edit formula
          this.$emit('edit-formula', { 
            latex: target.latex, 
            position: { x: target.left, y: target.top },
            fabricObject: target
          });
        }
      });
      
      window.addEventListener('resize', this.updateCanvasSize);
      window.addEventListener('keydown', this.handleKeyDown);
    },
    initializeCanvas() {
      const canvasElement = document.querySelector('canvas');
      this.fitToContainer(canvasElement);
      
      this.canvas = new Canvas(this.id, {
        ...this.definedProps,
      });
      
      this.initializeBrush();
      this.setBackgroundPattern();
      this.createEvents();
      this.saveState();
      this.setupEventListeners();
    },
  },
  computed: {
    definedProps() {
      const obj = { ...this.$props };
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
    
    this.canvas.off('object:added', this.saveState);
    this.canvas.off('object:modified', this.saveState);
    this.canvas.off('object:removed', this.saveState);
    
    window.removeEventListener('resize', this.updateCanvasSize);
    window.removeEventListener('keydown', this.handleKeyDown);
  },
  watch: {
    canvas: {
      handler() {
        this.$emit('canvas-updated', this.canvas);
      },
      deep: true,
      initial: true,
    },
    height(newValue) {
      this.canvas.setHeight(newValue);
      this.canvas.renderAll();
      this.canvas.calcOffset();
    },
    width(newValue) {
      this.canvas.setWidth(newValue);
      this.canvas.renderAll();
      this.canvas.calcOffset();
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
            if (obj.type === 'i-text' || obj.type === 'text') {
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
