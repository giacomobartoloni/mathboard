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
  <div id="boardcontainer" ref="boardRoot">
    <canvas :id="id"></canvas>
    <div ref="selectionOverlay" class="selection-overlay">
      <SelectionActionsPanel
        :visible="selectionPanel.visible"
        :x="selectionPanel.x"
        :y="selectionPanel.y"
        :placement="selectionPanel.placement"
        :selection-type="selectionPanel.selectionType"
        :selection-count="selectionPanel.selectionCount"
        :actions="selectionPanel.actions"
        @action="onSelectionAction"
      />
    </div>
  </div>
</template>

<script>
import { workspaceSafeArea } from "../board/layout/workspaceSafeArea.js";
import { markRaw, toRaw } from "vue";
import { Canvas, Pattern, PencilBrush, Shadow, InteractiveFabricObject, ActiveSelection, Group } from "fabric";
import * as fabric from "fabric";
import fabricStaticCanvas from "./fabricStaticCanvas";
import { paletteColorFromSelection } from "../config/colors";
import { BOARD_THEMES, INK_MODE_AUTO, INK_MODE_FIXED, normalizeBoardTheme } from "../config/themes";
import { extendedShapeInkPatch } from '../board/objects/shapeInk.js';
import { applyMaterializedFormulaMetadata } from "../formulas/applyMaterializedFormulaMetadata.js";
import { BoardController, BOARD_CONTROLLER_ERROR_CODES } from "../board/BoardController.js";
import { MATHBOARD_SERVICES } from "../core/serviceKeys.js";
import {
  ensureMathBoardObjectId,
  getMathBoardObjectId,
  regenerateMathBoardObjectIds,
} from "../board/ids.js";
import { BoardPersistenceService } from "../board/persistence/BoardPersistenceService.js";
import { BoardWorkspaceService } from "../board/BoardWorkspaceService.js";
import { IndexedDbBoardRepository } from "../storage/local/IndexedDbBoardRepository.js";
import {
  applySelectionObjectChrome,
  selectionChromeForBoard,
  selectionObjectChromeForBoard,
} from "../config/selectionChrome";
import {
  ACTION_DELETE,
  ACTION_DUPLICATE,
  ACTION_EDIT,
  ACTION_GROUP,
  ACTION_UNGROUP,
  panelSize,
  sceneBoxToViewport,
  selectionMeta,
  selectionPanelPosition,
} from "../config/selectionActions";
import SelectionActionsPanel from "./SelectionActionsPanel.vue";
import {
  snapshotObject,
  applySnapshot,
  snapshotsEqual,
  gestureObjects,
} from "../history/commandLog";
import { BoardHistory } from "../history/BoardHistory.js";
import { SelectionMutations } from "../board/interactions/SelectionMutations.js";
import { ShapeGesture } from "../board/interactions/ShapeGesture.js";
import { TextInsertionSession } from "../board/interactions/TextInsertionSession.js";
import { PanGesture } from "../board/interactions/PanGesture.js";
import { createBoardOperationAnalytics } from "../board/analytics/BoardOperationAnalytics.js";
import {
  trackEvent,
  trackBoardEngaged,
  recordProductAction,
} from "../analytics";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_FORMULA_MODES,
} from "../analytics/events.js";
import {
  StampError,
  STAMP_ERROR_CODES,
  decodeStampString,
  materializeStampDocument,
  encodeObjectsAsStamp,
} from "../stamps/index.js";
import { resolveStampRoot } from "../stamps/resolveStampRoot.js";
import { geometryControls, lineGeometryAdapter, isGeometryHandleTransform } from "../board/geometry/geometryHandles.js";

// Objects whose board ink lives on "stroke" (pencil strokes, shapes).
// Prefer Fabric class names; isType() also accepts legacy lowercase aliases.
const STROKE_INK_TYPES = ["Path", "Rect", "Circle", "Line"];
// Objects whose board ink lives on "fill".
const FILL_INK_TYPES = ["IText", "Text"];

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

const CURSOR_TYPES = {
  grab: 'grab',
  grabbing: 'grabbing',
  default: 'default',
  move: 'move',
  crosshair: 'crosshair',
  text: 'text'
};

export default {
  name: "DrawBoard",
  components: { SelectionActionsPanel },
  mixins: [fabricStaticCanvas],
  inject: {
    mathBoardServices: {
      from: MATHBOARD_SERVICES,
    },
  },
  props: {
    id: { type: String, required: false, default: "c" },
    selectedTool: { type: String, default: "pencil" },
    selectedShape: { type: String, default: "rectangle" },
    boardTheme: { type: String, default: "light" },
    selectedColor: { type: String, default: null },
    sessionReady: { type: Boolean, default: true },
    selectionPanelSuspended: { type: Boolean, default: false },
  },
  data() {
    return {
      canvas: null,
      type: "canvas",
      windowWidth: 0,
      windowHeight: 0,
      selectionPanel: {
        visible: false,
        x: 0,
        y: 0,
        placement: "top",
        selectionType: null,
        selectionCount: 0,
        actions: [],
      },
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
    // History retains Fabric instances outside reactive Vue data.
    this._boardHistory = new BoardHistory({
      getCanvas: () => this.canvas,
      onDocumentChanged: () => this._notifyDocumentChanged(),
      syncAutoInk: () => this.syncAutoInk(this.boardThemeConfig),
    });
    this._pendingTransform = null;
    this._pendingText = null;
    this._pencilGesture = false;
    this._selectionGesture = false;
    this._geometryEditing = null;
    this._shapeGesture = null;
    this._panGesture = null;
    this._textInsertion = null;
    // Services stay off data() so they are not reactive proxies.
    this._formulaRenderer = this.mathBoardServices.formulaRenderer;
    this._boardObjectPolicy = this.mathBoardServices.boardObjectPolicy;
    this._selectionMutations = new SelectionMutations({
      getCanvas: () => this.canvas,
      history: this._boardHistory,
      boardObjectPolicy: this._boardObjectPolicy,
      getDefaultInk: () => this.boardThemeConfig.defaultInk,
      onCommittedOperation: (effect) => this._recordUiOperation(effect),
    });
    this._persistence = null;
    this._boardWorkspace = null;
    this._boardControllers = new Map();
    this._boardAnalytics = createBoardOperationAnalytics({
      trackEvent, trackBoardEngaged, recordProductAction,
    });
    this._persistenceBootstrapped = false;
  },
  methods: {
    _notifyDocumentChanged() {
      this._persistence?.notifyDocumentChanged();
    },
    _ensureObjectId(object) {
      if (!object) return null;
      return ensureMathBoardObjectId(object);
    },
    getPersistenceStatus() {
      return this._persistence?.status || null;
    },
    getBoardId() {
      return this._persistence?.boardId || null;
    },
    _ensurePersistenceService() {
      if (this._persistence) return this._persistence;
      this._persistence = new BoardPersistenceService({
        repository: new IndexedDbBoardRepository(),
        boardObjectPolicy: this._boardObjectPolicy,
        getCanvas: () => this.canvas,
        buildFormula: (spec) => this._buildFormulaFromSemanticSpec(spec),
        resetHistory: () => this._resetHistory(),
        suspendHistory: (flag) => this._boardHistory.setSuspended(flag),
        isDocumentStable: () => this._isBoardInteractionStable(),
        onActiveBoardChanged: (board) => this.$emit('active-board-changed', board),
      });
      return this._persistence;
    },
    getBoardController() {
      return this._ensureBoardController('local_agent');
    },
    getBoardWorkspace() {
      if (!this._boardWorkspace) {
        this._boardWorkspace = new BoardWorkspaceService(this._ensurePersistenceService());
      }
      return this._boardWorkspace;
    },
    _ensureBoardController(interactionChannel = 'local_agent') {
      if (this._boardControllers.has(interactionChannel)) return this._boardControllers.get(interactionChannel);
      const controller = new BoardController({
        getCanvas: () => this.canvas,
        boardObjectPolicy: this._boardObjectPolicy,
        buildFormula: (spec) => this._buildFormulaFromSemanticSpec(spec),
        pushHistoryCommand: (command) => this._boardHistory.record(command),
        runWithoutHistory: (callback) => this._boardHistory.runSuspended(callback),
        prepareCreatedObject: (object) => {
          this._applyBoardDefaultInkToObjectTree(object);
          applySelectionObjectChrome(object, selectionObjectChromeForBoard(this.boardTheme));
        },
        afterMutation: () => this.refreshSelectionPanel(),
        prepareUpdatedObject: (object) => this._syncObjectAutoInk(object, this.boardThemeConfig),
        isMutationStable: () => this.sessionReady && this._isBoardInteractionStable(),
        getBoardId: () => this.getBoardId(),
        getLayoutSafeArea: () => workspaceSafeArea(this.canvas, this.$el.closest("#app")),
        onCommittedOperation: (effect) => this._boardAnalytics.record(effect, { interactionChannel }),
      });
      this._boardControllers.set(interactionChannel, controller);
      return controller;
    },
    _recordUiOperation(effect) {
      this._boardAnalytics.record(effect, { interactionChannel: 'ui' });
    },
    _presentAfterUiCommit(present) {
      try { present(); } catch (error) {
        console.error('Board presentation failed after commit.', error);
      }
    },
    /** Immutable, read-only interaction flags for the local visual capture bridge. */
    readInteractionState() {
      return {
        pan: Boolean(this._panGesture?.isActive()),
        shape: Boolean(this._shapeGesture?.isActive()),
        pencil: Boolean(this._pencilGesture),
        transform: Boolean(this._pendingTransform),
        textEdit: Boolean(this._pendingText),
        textInsertionEditing: Boolean(this._textInsertion?.isPendingEditing()),
      };
    },
    _isBoardInteractionStable() {
      if (!this.canvas) return false;
      if (this._shapeGesture?.isActive() || this._pencilGesture) return false;
      // Guard against stale reference: if the uncommitted text object is no longer
      // in editing mode (e.g. editing:exited event was missed due to tab focus loss
      // or a context switch), clear it so it does not permanently block mutations.
      this._textInsertion?.clearStale();
      if (this._textInsertion?.hasPending() || this._pendingTransform || this._pendingText) return false;
      return !this.canvas.getActiveObject()?.isEditing;
    },

    async bootstrapPersistence({ adoptCurrent = false } = {}) {
      if (this._persistenceBootstrapped || !this.canvas) return null;
      const persistence = this._ensurePersistenceService();
      const record = adoptCurrent
        ? await persistence.adoptCurrentCanvasAsNewBoard()
        : await persistence.bootstrap();
      this._persistenceBootstrapped = true;
      this.refreshSelectionPanel();
      return record;
    },
    async flushPersistence() {
      return this._persistence?.flush();
    },
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
     * Walks into permanent Groups (and ActiveSelection) so stamp kits follow theme.
     */
    _syncObjectAutoInk(object, config) {
      if (!object || object.mathboardInkMode !== INK_MODE_AUTO) return;
      if (this._boardObjectPolicy.isFormula(object)) {
        this._formulaRenderer.syncInk(object, config);
        return;
      }
      // Explicit no-paint surfaces stay transparent during update and replay.
      const painted = (value) => value !== null && value !== undefined && value !== ""
        && !["none", "transparent"].includes(String(value).trim().toLowerCase());
      const extended = extendedShapeInkPatch(object, config.defaultInk);
      if (extended) {
        object.set(extended);
      } else if (object.isType(...STROKE_INK_TYPES)) {
        const patch = {};
        if (painted(object.stroke)) patch.stroke = config.defaultInk;
        if (object.isType("Circle") && painted(object.fill)) patch.fill = config.defaultInk;
        object.set(patch);
      } else if (object.isType(...FILL_INK_TYPES) && painted(object.fill)) {
        object.set("fill", config.defaultInk);
      }
    },
    syncAutoInk(config) {
      const apply = (object) => {
        if (!object) return;
        if (this._boardObjectPolicy.isBoardGroup(object)
          || this._boardObjectPolicy.isActiveSelection(object)) {
          object.getObjects().forEach(apply);
          return;
        }
        this._syncObjectAutoInk(object, config);
      };
      this.canvas.forEachObject(apply);
    },
    markPathInk({ path }) {
      if (!path) return;
      path.mathboardInkMode = this.inkMode;
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
      this.refreshSelectionPanel();
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
    applyToolCursor(tool) {
      if (!this.canvas) return;
      if (tool === 'pan') {
        if (!this._panGesture?.isActive()) this.setCursor(CURSOR_TYPES.grab);
        return;
      }
      if (tool === 'pencil' || tool === 'shapes') {
        this.canvas.freeDrawingCursor = CURSOR_TYPES.crosshair;
        this.setCursor(CURSOR_TYPES.crosshair);
        return;
      }
      if (tool === 'font') {
        this.setCursor(CURSOR_TYPES.text);
        return;
      }
      if (tool === 'formula') {
        this.setCursor(CURSOR_TYPES.crosshair);
        return;
      }
      this.setCursor(CURSOR_TYPES.default, CURSOR_TYPES.move);
    },
    /**
     * Selection outline and handles follow the board theme. Object ink is not
     * part of this patch, and the command log is not touched.
     */
    applySelectionChrome() {
      if (!this.canvas) return;
      const chrome = selectionChromeForBoard(this.boardTheme);
      const {
        selectionColor,
        selectionBorderColor,
        selectionLineWidth,
        selectionDashArray,
      } = chrome;
      const objectChrome = selectionObjectChromeForBoard(this.boardTheme);
      Object.assign(InteractiveFabricObject.ownDefaults, objectChrome);
      this.canvas.selectionColor = selectionColor;
      this.canvas.selectionBorderColor = selectionBorderColor;
      this.canvas.selectionLineWidth = selectionLineWidth;
      this.canvas.selectionDashArray = selectionDashArray;

      this._boardHistory.setSuspended(true);
      try {
        this.canvas.forEachObject((obj) => applySelectionObjectChrome(obj, objectChrome));
        const active = this.canvas.getActiveObject();
        if (active?.isType?.("ActiveSelection")) {
          applySelectionObjectChrome(active, objectChrome);
        }
      } finally {
        this._boardHistory.setSuspended(false);
      }
      this.canvas.requestRenderAll();
    },
    _panelAllowed() {
      if (this.selectionPanelSuspended || this._selectionGesture || this._panGesture?.isActive()) return false;
      return this.selectedTool === "select" || this.selectedTool === "pan";
    },
    _hideSelectionPanel() {
      if (!this.selectionPanel.visible) return;
      this.selectionPanel = {
        ...this.selectionPanel,
        visible: false,
        actions: [],
      };
    },
    _selectionClientBox(active) {
      const canvasEl = this.canvas?.upperCanvasEl;
      if (!active || !canvasEl) return null;
      const scene = sceneBoxToViewport(active.getBoundingRect(), this.canvas.viewportTransform);
      if (!scene) return null;
      const bounds = canvasEl.getBoundingClientRect();
      const logicalW = this.canvas.getWidth() || bounds.width;
      const logicalH = this.canvas.getHeight() || bounds.height;
      const scaleX = logicalW ? bounds.width / logicalW : 1;
      const scaleY = logicalH ? bounds.height / logicalH : 1;
      return {
        left: bounds.left + scene.left * scaleX,
        top: bounds.top + scene.top * scaleY,
        width: scene.width * scaleX,
        height: scene.height * scaleY,
      };
    },
    refreshSelectionPanel() {
      if (!this.canvas || !this._panelAllowed()) {
        this._hideSelectionPanel();
        return;
      }
      const active = this.canvas.getActiveObject();
      if (!active || active.isEditing) {
        this._hideSelectionPanel();
        return;
      }
      const meta = selectionMeta(active);
      const overlay = this.$refs.selectionOverlay;
      const client = this._selectionClientBox(active);
      if (!meta.hasSelection || !overlay || !client) {
        this._hideSelectionPanel();
        return;
      }
      const overlayBounds = overlay.getBoundingClientRect();
      const position = selectionPanelPosition({
        frame: {
          left: client.left - overlayBounds.left,
          top: client.top - overlayBounds.top,
          width: client.width,
          height: client.height,
        },
        viewport: { left: 0, top: 0, width: overlayBounds.width, height: overlayBounds.height },
        panel: panelSize(meta.actions.length),
      });
      if (!position) {
        this._hideSelectionPanel();
        return;
      }
      const next = {
        visible: true,
        x: position.x,
        y: position.y,
        placement: position.placement,
        selectionType: meta.selectionType,
        selectionCount: meta.selectionCount,
        actions: meta.actions,
      };
      const prev = this.selectionPanel;
      const same = prev.visible === next.visible
        && prev.x === next.x
        && prev.y === next.y
        && prev.placement === next.placement
        && prev.selectionType === next.selectionType
        && prev.selectionCount === next.selectionCount
        && prev.actions.join() === next.actions.join();
      if (!same) this.selectionPanel = next;
    },
    _clearGeometryEditing() {
      const previous = this._geometryEditing;
      if (!previous) return;
      const { object, controls, hadOwnControls, hasBorders } = previous;
      if (hadOwnControls) object.controls = controls;
      else delete object.controls;
      object.hasBorders = hasBorders;
      // Fabric keeps cached hit regions (oCoords) keyed by the control names.
      // Restore those regions together with the original controls.
      object.setCoords();
      this._geometryEditing = null;
      // The old endpoint controls may still be painted on the upper canvas.
      // Keep visual controls and hit regions in sync immediately.
      this.canvas?.requestRenderAll();
    },
    _syncGeometryEditing() {
      const active = this.canvas?.getActiveObject();
      // Geometry editing is deliberately limited to top-level, singly selected lines.
      const editable = this.selectedTool === 'select'
        && active?.isType?.('Line')
        && this.canvas.getObjects().includes(active)
        && this.canvas.getActiveObjects().length === 1 ? active : null;
      if (this._geometryEditing?.object === editable) return;
      this._clearGeometryEditing();
      if (!editable) return;
      this._geometryEditing = {
        object: editable,
        controls: editable.controls,
        hadOwnControls: Object.prototype.hasOwnProperty.call(editable, 'controls'),
        hasBorders: editable.hasBorders,
      };
      editable.controls = geometryControls(lineGeometryAdapter);
      editable.hasBorders = false;
      // Rebuild oCoords before the next hit test: stale native keys crash findControl.
      editable.setCoords();
      this.canvas.requestRenderAll();
    },
    onSelectionChanged() {
      // Preserve PR #85: ActiveSelection is a transient wrapper, not a canvas object.
      // Apply native selection chrome (including side-control visibility) on selection.
      const active = this.canvas?.getActiveObject();
      if (active) {
        applySelectionObjectChrome(active, selectionObjectChromeForBoard(this.boardTheme));
      }
      this._syncGeometryEditing();
      this.emitSelectionColor();
      this.refreshSelectionPanel();
    },
    onSelectionCleared() {
      this._syncGeometryEditing();
      this.refreshSelectionPanel();
    },
    onPencilPointerDown() {
      if (this.canvas.isDrawingMode) this._pencilGesture = true;
    },
    onSelectionPointerUp() {
      this._pencilGesture = false;
      // Fabric starts a transform before it knows whether the pointer will move.
      // A click (including Formula double-click) has no object:modified event.
      this._pendingTransform = null;
      if (!this._selectionGesture) return;
      this._selectionGesture = false;
      this.refreshSelectionPanel();
    },
    onSelectionAction(actionId) {
      if (actionId === ACTION_DELETE) {
        this.deleteSelection();
        this.$nextTick(() => this._focusBoard());
        return;
      }
      if (actionId === ACTION_DUPLICATE) {
        this.duplicateSelection();
        return;
      }
      if (actionId === ACTION_GROUP) {
        this.groupSelection();
        return;
      }
      if (actionId === ACTION_UNGROUP) {
        this.ungroupSelection();
        return;
      }
      if (actionId === ACTION_EDIT) this.editSelection();
    },
    _focusBoard() {
      const root = this.$refs.boardRoot;
      if (!root || typeof root.focus !== "function") return;
      if (!root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
      root.focus({ preventScroll: true });
    },
    selectAll() {
      if (!this.canvas) return false;
      // toRaw: shapes assigned through data() may be Vue proxies; Fabric's
      // ActiveSelection layout uses === on group membership and mis-transforms
      // proxied objects (visible jump on Cmd/Ctrl+A).
      const objects = this.canvas.getObjects().map((object) => toRaw(object));
      if (!objects.length) return false;

      this.canvas.discardActiveObject();
      if (objects.length === 1) {
        this.canvas.setActiveObject(objects[0]);
      } else {
        this.canvas.setActiveObject(new ActiveSelection(objects, { canvas: this.canvas }));
      }
      this.canvas.requestRenderAll();
      this.refreshSelectionPanel();
      return true;
    },
    async duplicateSelection() {
      const changed = await this._selectionMutations.duplicate();
      if (changed) this.refreshSelectionPanel();
      return changed;
    },
    editSelection() {
      const active = this.canvas?.getActiveObject();
      if (!active || active.isEditing || !this._boardObjectPolicy.isFormula(active)) return;
      this.$emit("edit-formula", {
        latex: active.latex,
        position: { x: active.left, y: active.top },
        fabricObject: active,
      });
    },
    isBoardEmpty() {
      return !this.canvas || this.canvas.getObjects().length === 0;
    },
    _viewportCenterScenePoint() {
      const vpt = this.canvas.viewportTransform;
      const width = this.canvas.getWidth();
      const height = this.canvas.getHeight();
      return {
        x: (width / 2 - vpt[4]) / vpt[0],
        y: (height / 2 - vpt[5]) / vpt[3],
      };
    },
    async _buildFormulaFromSemanticSpec(spec) {
      const fixedInk = spec.mathboardInkMode === INK_MODE_FIXED
        ? [spec.fill, spec.stroke].find((paint) => paint && paint !== 'none' && paint !== 'transparent')
        : null;
      const formula = await this._buildFormulaObject(
        { latex: spec.latex, ink: fixedInk },
        {
          x: spec.left ?? 0,
          y: spec.top ?? 0,
        },
      );
      if (!formula) return null;
      const next = {};
      [
        "left",
        "top",
        "scaleX",
        "scaleY",
        "skewX",
        "skewY",
        "angle",
        "flipX",
        "flipY",
        "originX",
        "originY",
        "opacity",
      ].forEach((key) => {
        if (spec[key] !== undefined && spec[key] !== null) next[key] = spec[key];
      });
      if (Object.keys(next).length) {
        formula.set(next);
        formula.setCoords();
      }
      // Keep the monochrome semantic ink on the root for replacement and persistence.
      if (fixedInk) formula.set('fill', fixedInk);
      // Ink mode is semantic; vector formulas apply destination ink via applyInk.
      applyMaterializedFormulaMetadata(formula, spec);
      return formula;
    },
    async _materializeStamp(encoded) {
      const doc = decodeStampString(encoded);
      return materializeStampDocument(doc, {
        buildFormula: (spec) => this._buildFormulaFromSemanticSpec(spec),
      });
    },
    _wrapAsStampGroup(objects) {
      // A Formula may be implemented as a Fabric Group; only semantic Board Groups
      // count as an existing Stamp wrapper.
      const root = resolveStampRoot(objects, {
        isBoardGroup: (object) => this._boardObjectPolicy.isBoardGroup(object),
        wrap: (members) => new Group(members, {
          subTargetCheck: false,
          interactive: false,
        }),
      });

      // A formula-only Stamp has a technical wrapper Group. Fabric does not include
      // child padding in the parent's selection box, so mirror the Formula runtime
      // padding onto the root without persisting it in the Stamp payload.
      if (this._boardObjectPolicy.isBoardGroup(root)) {
        const members =
          typeof root.getObjects === "function" ? root.getObjects() : [];
        if (
          members.length === 1
          && this._boardObjectPolicy.isFormula(members[0])
        ) {
          root.set("padding", members[0].padding ?? 0);
        }
      }

      return root;
    },
    _placeGroupAtViewportCenter(group) {
      const center = this._viewportCenterScenePoint();
      group.set({
        left: center.x,
        top: center.y,
        originX: "center",
        originY: "center",
      });
      group.setCoords();
    },
    /**
     * Native kits mark ink as AUTO. Apply the board default ink so stamps
     * follow the theme Main color instead of baked placeholder hex values.
     * Explicit FIXED colors from imported stamps are left alone.
     */
    _applyBoardDefaultInkToObjectTree(root) {
      if (!root) return;
      const ink = this.boardThemeConfig.defaultInk;
      const walk = (object) => {
        if (!object) return;

        if (this._boardObjectPolicy.isFormula(object)) {
          if (object.mathboardInkMode !== INK_MODE_FIXED) {
            object.mathboardInkMode = INK_MODE_AUTO;
            this._formulaRenderer.syncInk(object, this.boardThemeConfig);
          }
          return;
        }

        if (this._boardObjectPolicy.isBoardGroup(object)) {
          const members = typeof object.getObjects === "function" ? object.getObjects() : [];
          members.forEach(walk);
          return;
        }

        if (object.mathboardInkMode === INK_MODE_FIXED) return;

        const extended = extendedShapeInkPatch(object, ink);
        if (extended) {
          object.set({ ...extended, mathboardInkMode: INK_MODE_AUTO });
          return;
        }
        if (object.isType?.(...STROKE_INK_TYPES)) {
          const patch = { stroke: ink, mathboardInkMode: INK_MODE_AUTO };
          if (
            object.isType("Circle")
            && object.fill
            && object.fill !== "transparent"
          ) {
            patch.fill = ink;
          }
          object.set(patch);
          return;
        }
        if (object.isType?.(...FILL_INK_TYPES)) {
          object.set({ fill: ink, mathboardInkMode: INK_MODE_AUTO });
        }
      };
      walk(root);
    },
    /**
     * Insert a stamp without clearing the board. One history `add` for the group.
     * @returns {Promise<{ ok: true, group: object } | { ok: false, message: string }>}
     */
    async insertStamp(encoded) {
      if (!this.canvas) {
        return { ok: false, message: "Board is not ready." };
      }
      let objects;
      try {
        objects = await this._materializeStamp(encoded);
      } catch (error) {
        const message = error instanceof StampError
          ? error.message
          : "Could not recreate stamp objects.";
        console.error("insertStamp failed", error);
        return { ok: false, message };
      }
      if (!this.canvas) {
        return { ok: false, message: "Board is not ready." };
      }

      const group = this._wrapAsStampGroup(objects);
      regenerateMathBoardObjectIds(group);
      this._applyBoardDefaultInkToObjectTree(group);
      this._placeGroupAtViewportCenter(group);
      this.canvas.add(group);
      this.canvas.setActiveObject(group);
      if (!this._recordAdd(group)) return { ok: false, message: "Stamp could not be committed." };
      this._recordUiOperation({ kind: 'create', objectKinds: ['stamp'] });
      this._presentAfterUiCommit(() => {
        this.canvas.requestRenderAll();
        this.refreshSelectionPanel();
      });
      return { ok: true, group };
    },
    _resetHistory() {
      this._boardHistory.reset();
      this._pendingTransform = null;
      this._pendingText = null;
      this._textInsertion?.reset();
    },
    _clearBoardContents() {
      if (!this.canvas) return;
      this.canvas.discardActiveObject();
      const objects = this.canvas.getObjects().slice();
      this._boardHistory.setSuspended(true);
      try {
        objects.forEach((object) => this.canvas.remove(object));
      } finally {
        this._boardHistory.setSuspended(false);
      }
      this._resetHistory();
      this.refreshSelectionPanel();
    },
    /**
     * Clear the board, reset history, then insert a stamp (template / URL).
     * Materializes before clearing so a failed stamp leaves the board intact.
     */
    async bootstrapFromStamp(encoded) {
      if (!this.canvas) {
        return { ok: false, message: "Board is not ready." };
      }
      let objects;
      try {
        objects = await this._materializeStamp(encoded);
      } catch (error) {
        const message = error instanceof StampError
          ? error.message
          : "Could not recreate stamp objects.";
        console.error("bootstrapFromStamp failed", error);
        return { ok: false, message };
      }
      if (!this.canvas) {
        return { ok: false, message: "Board is not ready." };
      }

      this._clearBoardContents();
      const group = this._wrapAsStampGroup(objects);
      regenerateMathBoardObjectIds(group);
      this._applyBoardDefaultInkToObjectTree(group);
      this._placeGroupAtViewportCenter(group);
      this.canvas.add(group);
      this.canvas.setActiveObject(group);
      if (!this._recordAdd(group)) return { ok: false, message: "Stamp could not be committed." };
      this._recordUiOperation({ kind: 'create', objectKinds: ['stamp_template'] });
      this._presentAfterUiCommit(() => {
        this.canvas.requestRenderAll();
        this.refreshSelectionPanel();
      });
      return { ok: true, group };
    },
    exportSelectionToStamp() {
      if (!this.canvas) {
        throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, "Board is not ready.");
      }
      const active = this.canvas.getActiveObject();
      if (!active) {
        throw new StampError(STAMP_ERROR_CODES.INVALID_SHAPE, "Nothing is selected.");
      }
      const sources = active.isType("ActiveSelection")
        ? active.getObjects().slice()
        : [active];
      return encodeObjectsAsStamp(sources);
    },
    groupSelection() {
      const changed = this._selectionMutations.group();
      if (changed) {
        this._presentAfterUiCommit(() => this.refreshSelectionPanel());
      }
      return changed;
    },
    ungroupSelection() {
      const changed = this._selectionMutations.ungroup();
      if (changed) {
        this._presentAfterUiCommit(() => {
          const objects = this.canvas.getActiveObjects();
          const chrome = selectionObjectChromeForBoard(this.boardTheme);
          objects.forEach((object) => applySelectionObjectChrome(object, chrome));
          this.refreshSelectionPanel();
        });
      }
      return changed;
    },
    enablePanning() {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = false;
      this.setObjectsSelectable(false);
      this.setCursor(CURSOR_TYPES.grab);
      this.canvas.allowTouchScrolling = false;
      this._panGesture.activate();
    },
    disablePanning() {
      this._panGesture.deactivate();
      this.canvas.selection = true;
      this.setObjectsSelectable(true);
      this.canvas.allowTouchScrolling = false;
    },
    enableTextInsertion() {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = true;
      this.setObjectsSelectable(true);
      this._textInsertion.activate();
    },
    disableTextInsertion() {
      this._textInsertion.deactivate();
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
    async _buildFormulaObject(formulaData, position) {
      try {
        return await this._formulaRenderer.render({
          latex: formulaData.latex,
          html: formulaData.html,
          position,
          ink: formulaData.ink || this.boardThemeConfig.defaultInk,
          inkIsLight: this.boardThemeConfig.inkIsLight,
        });
      } catch (error) {
        console.error("Formula rendering failed", error);
        return null;
      }
    },
    async addFormulaToCanvas(formulaData, position) {
      try {
        await this._ensureBoardController('ui').create({
          type: 'formula',
          latex: formulaData.latex,
          left: position.x,
          top: position.y,
        }, { select: true });
      } catch (error) {
        if (error.code === BOARD_CONTROLLER_ERROR_CODES.FORMULA_RENDER_FAILED) {
          trackEvent(ANALYTICS_EVENTS.FORMULA_RENDER_FAILED, {
            mode: ANALYTICS_FORMULA_MODES.CREATE,
          });
        }
        return false;
      }
      return true;
    },
    async replaceFormula(existing, formulaData) {
      existing = toRaw(existing);
      if (!existing || !this.canvas) return false;
      try {
        await this._ensureBoardController('ui').update(getMathBoardObjectId(existing), {
          latex: formulaData.latex,
        });
      } catch (error) {
        if (error.code === BOARD_CONTROLLER_ERROR_CODES.FORMULA_RENDER_FAILED) {
          trackEvent(ANALYTICS_EVENTS.FORMULA_RENDER_FAILED, {
            mode: ANALYTICS_FORMULA_MODES.EDIT,
          });
        }
        return false;
      }
      return true;
    },
    enableShapeDrawing() {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = false;
      this.setObjectsSelectable(false);
      this._shapeGesture.activate();
    },
    disableShapeDrawing() {
      // Complete the current gesture before dropping mouse subscriptions.
      this._shapeGesture.deactivate();
      this.canvas.selection = true;
      this.setObjectsSelectable(true);
    },
    // Keep public adapter entry points for existing integrations.
    startDrawingShape(opt) { this._shapeGesture?.start(opt); },
    continueDrawingShape(opt) { this._shapeGesture?.move(opt); },
    finishDrawingShape() { return this._shapeGesture?.finish(this.selectedTool === 'shapes') || false; },
    createShape(x, y) { return this._shapeGesture?.createShape(x, y) || null; },
    addText(opt) {
      return this._textInsertion?.start(opt) || false;
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
      return this._selectionMutations.recolor(color, options);
    },

    deleteSelection() {
      const removed = this._selectionMutations.delete();
      if (!removed.length) return;
      this._presentAfterUiCommit(() => {
        this.refreshSelectionPanel();
        this._focusBoard();
      });
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
      return this._shapeGesture?.cancel() || false;
    },
    clearSelection() {
      if (!this.canvas?.getActiveObject()) return false;
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
      return true;
    },
    _cancelGeometryTransform() {
      const transform = this.canvas?._currentTransform;
      if (!transform || !isGeometryHandleTransform(transform)) return false;

      // A tool switch or Escape cancels the entire in-flight gesture, not just
      // subsequent pointer moves. Restore the original object without history.
      transform.mathboardCancelled = true;
      const pending = this._pendingTransform?.find(({ object }) => object === transform.target);
      if (pending) applySnapshot(pending.object, pending.before);
      this._pendingTransform = null;
      this._selectionGesture = false;

      // Fabric's public interruption API finalizes the pointer transform.
      // Clear its modified flag first to suppress a spurious object:modified
      // event (and accidental history/persistence writes) after the rollback.
      transform.actionPerformed = false;
      this.canvas.endCurrentTransform();
      this.canvas.requestRenderAll();
      this.refreshSelectionPanel();
      return true;
    },
    cancelTransientAction() {
      if (this.cancelInProgressShape()) return true;
      if (this._cancelGeometryTransform()) return true;
      return this.clearSelection();
    },
    _recordAdd(object) {
      if (!object || !this.canvas) return false;
      this._ensureObjectId(object);
      const index = this.canvas.getObjects().indexOf(object);
      if (index < 0) return false;
      let committed = false;
      try {
        committed = this._boardHistory.record({ type: 'add', object, index }) === true;
      } catch (error) {
        console.error('Board object could not be recorded.', error);
      }
      if (committed) return true;
      if (this.canvas.getActiveObjects().includes(object)) this.canvas.discardActiveObject();
      this.canvas.remove(object);
      this.canvas.requestRenderAll();
      return false;
    },
    _runHistory(direction) {
      if (!this.canvas) return null;
      this._pendingTransform = null;
      this._pendingText = null;
      const command = direction === "undo" ? this._boardHistory.undo() : this._boardHistory.redo();
      return command;
    },
    undo() {
      const command = this._runHistory('undo');
      if (!command) return;
      this._recordUiOperation({ kind: 'undo', commandType: command.type });
      try { this._notifyDocumentChanged(); } finally {
        this._presentAfterUiCommit(() => this.refreshSelectionPanel());
      }
    },
    redo() {
      const command = this._runHistory('redo');
      if (!command) return;
      this._recordUiOperation({ kind: 'redo', commandType: command.type });
      try { this._notifyDocumentChanged(); } finally {
        this._presentAfterUiCommit(() => this.refreshSelectionPanel());
      }
    },
    onPathCreated({ path }) {
      this._pencilGesture = false;
      if (this._recordAdd(path)) {
        this._recordUiOperation({ kind: 'create', objectKinds: ['path'] });
      }
    },
    onBeforeTransform({ transform }) {
      if (!this._selectionGesture) {
        this._selectionGesture = true;
        this._hideSelectionPanel();
      }
      if (this._boardHistory.isSuspended() || !transform || !transform.target) return;
      // Native IText editing can start on mouse-down before Fabric announces
      // the same click as a transform. Keep the edit's history snapshot.
      if (transform.target.isEditing) return;
      // A text edit commits on exit, before a later drag can start. Drop a
      // snapshot left behind by an edit that did not change the text.
      this._pendingText = null;
      const includeGeometry = isGeometryHandleTransform(transform);
      this._pendingTransform = gestureObjects(transform.target).map((object) => ({
        object,
        includeGeometry,
        before: snapshotObject(object, { includeGeometry })
      }));
    },
    onTextEditingEntered({ target }) {
      this._hideSelectionPanel();
      if (!target || this._textInsertion?.owns(target)) return;
      this._pendingText = { object: target, before: snapshotObject(target) };
      trackEvent(ANALYTICS_EVENTS.TEXT_EDIT_STARTED);
    },
    onTextEditingExited({ target }) {
      const pending = this._pendingText;
      // Fabric emits no object:modified event when an edit leaves the snapshot unchanged.
      if (pending?.object === target && snapshotsEqual(pending.before, snapshotObject(target))) {
        this._pendingText = null;
      }
      this.refreshSelectionPanel();
    },
    onObjectModified(opt) {
      this._selectionGesture = false;
      try {
        if (this._boardHistory.isSuspended() || !opt) return;

        if (opt.transform) {
          const pending = this._pendingTransform;
          this._pendingTransform = null;
          if (!pending) return;
          const entries = pending
            .map(({ object, before, includeGeometry }) => ({
              object,
              before,
              after: snapshotObject(object, { includeGeometry })
            }))
            .filter((entry) => !snapshotsEqual(entry.before, entry.after));
          if (entries.length) this._boardHistory.record({ type: 'modify', entries });
          return;
        }

        const pendingText = this._pendingText;
        if (!pendingText || pendingText.object !== opt.target) return;
        this._pendingText = null;
        const after = snapshotObject(opt.target);
        if (snapshotsEqual(pendingText.before, after)) return;
        if (this._boardHistory.record({
          type: 'modify',
          entries: [{ object: opt.target, before: pendingText.before, after }]
        })) this._recordUiOperation({ kind: 'text_edit' });
      } finally {
        this.refreshSelectionPanel();
      }
    },
    zoomIn() {
      const currentZoom = this.canvas.getZoom();
      const newZoom = currentZoom * 1.1;
      if (newZoom > 5) return; // Limite massimo di zoom
      this.canvas.setZoom(newZoom);
      this.canvas.requestRenderAll();
      this.refreshSelectionPanel();
    },
    zoomOut() {
      const currentZoom = this.canvas.getZoom();
      const newZoom = currentZoom / 1.1;
      if (newZoom < 0.1) return; // Limite minimo di zoom
      this.canvas.setZoom(newZoom);
      this.canvas.requestRenderAll();
      this.refreshSelectionPanel();
    },
    resetZoom() {
      this.canvas.setZoom(1);
      this.canvas.viewportTransform[4] = 0; // Reset pan X
      this.canvas.viewportTransform[5] = 0; // Reset pan Y
      this.canvas.requestRenderAll();
      this.refreshSelectionPanel();
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
      this.canvas.on('text:editing:exited', this.onTextEditingExited);

      this.canvas.on('selection:created', this.onSelectionChanged);
      this.canvas.on('selection:updated', this.onSelectionChanged);
      this.canvas.on('selection:cleared', this.onSelectionCleared);
      this.canvas.on('mouse:down', this.onPencilPointerDown);
      this.canvas.on('mouse:up', this.onSelectionPointerUp);

      // Enable double-click editing for text objects and formulas
      this.canvas.on('mouse:dblclick', (opt) => {
        const target = opt.target;
        if (target && target.isType(...FILL_INK_TYPES) && target.editable) {
          target.enterEditing();
          target.selectAll();
        } else if (target && this._boardObjectPolicy.isFormula(target)) {
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
      
      this._ensureBoardController();
      this._shapeGesture = new ShapeGesture({
        canvas: this.canvas,
        getShape: () => this.selectedShape,
        getInk: () => this.activeInk,
        getInkMode: () => this.inkMode,
        onCommitted: (shape, shapeType) => {
          if (this._recordAdd(shape)) {
            this._recordUiOperation({ kind: 'create', objectKinds: ['shape'], shape: shapeType });
          }
        },
        onComplete: () => this.$emit('shape-drawing-completed'),
      });
      this._panGesture = new PanGesture({
        canvas: this.canvas,
        onStart: () => {
          this._hideSelectionPanel();
          this.setCursor(CURSOR_TYPES.grabbing);
        },
        onFinish: () => {
          if (this.selectedTool === 'pan') this.setCursor(CURSOR_TYPES.grab);
          this.refreshSelectionPanel();
        },
      });
      this._textInsertion = new TextInsertionSession({
        canvas: this.canvas,
        getInk: () => this.activeInk,
        getInkMode: () => this.inkMode,
        scheduleFocus: async (callback) => { await this.$nextTick(); callback(); },
        onStarted: () => trackEvent(ANALYTICS_EVENTS.TEXT_CREATION_STARTED),
        onCancelled: (text) => {
          this._boardHistory.removeRetained(text);
          trackEvent(ANALYTICS_EVENTS.TEXT_CREATION_CANCELLED);
        },
        onCommitted: (text) => {
          if (this._recordAdd(text)) {
            this._recordUiOperation({ kind: 'create', objectKinds: ['text'] });
          }
        },
        onComplete: () => this.$emit('text-editing-completed'),
      });
      this.initializeBrush();
      this.setBackgroundPattern();
      this.applySelectionChrome();
      this.createEvents();
      this.setupEventListeners();
      this.applyToolCursor(this.selectedTool);
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
      delete obj.selectionPanelSuspended;
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
    this._clearGeometryEditing();
    this._shapeGesture?.dispose();
    this._textInsertion?.dispose();
    this._panGesture?.dispose();
    this._persistence?.dispose();
    CANVAS_EVENTS.forEach((event) => {
      this.canvas.off(event);
    });
    
    this.canvas.off('before:path:created', this.markPathInk);
    this.canvas.off('path:created', this.onPathCreated);
    this.canvas.off('before:transform', this.onBeforeTransform);
    this.canvas.off('object:modified', this.onObjectModified);
    this.canvas.off('text:editing:entered', this.onTextEditingEntered);
    this.canvas.off('text:editing:exited', this.onTextEditingExited);
    this.canvas.off('selection:created', this.onSelectionChanged);
    this.canvas.off('selection:updated', this.onSelectionChanged);
    this.canvas.off('selection:cleared', this.onSelectionCleared);
    this.canvas.off('mouse:down', this.onPencilPointerDown);
    this.canvas.off('mouse:up', this.onSelectionPointerUp);
    
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
      this.applySelectionChrome();
      this.syncAutoInk(this.boardThemeConfig);
      this.canvas.requestRenderAll();
    },
    selectedTool(newTool) {
      if (!this.canvas) return;

      // Switching tools during endpoint editing must roll back the whole drag
      // before the native controls are restored, even while the mouse is down.
      this._cancelGeometryTransform();
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
      this.applyToolCursor(newTool);
      this._syncGeometryEditing();
      this.refreshSelectionPanel();
    },
    selectionPanelSuspended() {
      this.refreshSelectionPanel();
    },
  },
};
</script>

<!-- Fabric creates canvas wrappers dynamically, so keep the descendant canvas selector global but anchored to this board. -->
<style>
div#boardcontainer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: -1000;
}
div#boardcontainer:focus {
  outline: none;
}
.selection-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}
#boardcontainer canvas {
  width: 100%;
  height: 100%;
}
</style>
