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
import { markRaw, toRaw } from "vue";
import { Canvas, Pattern, PencilBrush, Shadow, Rect, Circle, Line, IText, InteractiveFabricObject, ActiveSelection, Group } from "fabric";
import * as fabric from "fabric";
import fabricStaticCanvas from "./fabricStaticCanvas";
import { applyAutoInk, applyExplicitInk, flattenInkTargets, paletteColorFromSelection } from "../config/colors";
import { BOARD_THEMES, INK_MODE_AUTO, INK_MODE_FIXED, normalizeBoardTheme } from "../config/themes";
import { FORMULA_CLONE_PROPS } from "../formulas/constants.js";
import { applyMaterializedFormulaMetadata } from "../formulas/applyMaterializedFormulaMetadata.js";
import { MATHBOARD_SERVICES } from "../core/serviceKeys.js";
import {
  ensureMathBoardObjectId,
  getMathBoardObjectId,
  regenerateMathBoardObjectIds,
} from "../board/ids.js";
import { BoardPersistenceService } from "../board/persistence/BoardPersistenceService.js";
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
  DUPLICATE_OFFSET,
  panelSize,
  sceneBoxToViewport,
  selectionMeta,
  selectionPanelPosition,
} from "../config/selectionActions";
import SelectionActionsPanel from "./SelectionActionsPanel.vue";
import {
  HISTORY_LIMIT,
  snapshotObject,
  applySnapshot,
  snapshotsEqual,
  gestureObjects,
} from "../history/commandLog";
import {
  trackEvent,
  trackBoardEngaged,
  recordProductAction,
} from "../analytics";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_OBJECT_TYPES,
  ANALYTICS_FORMULA_MODES,
} from "../analytics/events.js";
import { buildObjectDeletedMetadata } from "../analytics/deletionMetadata.js";
import {
  StampError,
  STAMP_ERROR_CODES,
  decodeStampString,
  materializeStampDocument,
  encodeObjectsAsStamp,
} from "../stamps/index.js";
import { resolveStampRoot } from "../stamps/resolveStampRoot.js";

// Objects whose board ink lives on "stroke" (pencil strokes, shapes).
// Prefer Fabric class names; isType() also accepts legacy lowercase aliases.
const STROKE_INK_TYPES = ["Path", "Rect", "Circle", "Line"];
// Objects whose board ink lives on "fill".
const FILL_INK_TYPES = ["IText", "Text"];

// Fabric 7 defaults origin to center/center; keep left/top for click-to-place UX.
const LEFT_TOP_ORIGIN = { originX: "left", originY: "top" };

// On formula edit, keep the user's transform; new SVG owns width/height.
const FORMULA_REPLACEMENT_TRANSFORM_KEYS = [
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
];

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
    selectionPanelSuspended: { type: Boolean, default: false },
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
    // The stack holds Fabric instances. It stays off Vue's reactive state so
    // those instances are not proxied.
    this._history = [];
    this._historyStep = -1;
    this._suspendHistory = false;
    this._pendingTransform = null;
    this._pendingText = null;
    this._uncommittedText = null;
    this._historyTipKind = "command";
    this._selectionGesture = false;
    // Services stay off data() so they are not reactive proxies.
    this._formulaRenderer = this.mathBoardServices.formulaRenderer;
    this._boardObjectPolicy = this.mathBoardServices.boardObjectPolicy;
    this._persistence = null;
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
        buildFormula: (spec) => this._buildFormulaFromStamp(spec),
        resetHistory: () => this._resetHistory(),
        suspendHistory: (flag) => {
          this._suspendHistory = Boolean(flag);
        },
      });
      return this._persistence;
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
    syncAutoInk(config) {
      const apply = (obj) => {
        if (!obj) return;

        if (this._boardObjectPolicy.isFormula(obj)) {
          if (obj.mathboardInkMode === INK_MODE_AUTO) {
            this._formulaRenderer.syncInk(obj, config);
          }
          return;
        }

        if (
          this._boardObjectPolicy.isBoardGroup(obj)
          || this._boardObjectPolicy.isActiveSelection(obj)
        ) {
          const members = typeof obj.getObjects === "function" ? obj.getObjects() : [];
          members.forEach(apply);
          return;
        }

        if (obj.mathboardInkMode !== INK_MODE_AUTO) return;

        if (obj.isType(...STROKE_INK_TYPES)) {
          const patch = { stroke: config.defaultInk };
          if (
            obj.isType("Circle")
            && obj.fill
            && obj.fill !== "transparent"
          ) {
            patch.fill = config.defaultInk;
          }
          obj.set(patch);
        } else if (obj.isType(...FILL_INK_TYPES)) {
          obj.set("fill", config.defaultInk);
        }
      };
      this.canvas.forEachObject(apply);
    },
    markPathInk({ path }) {
      if (!path) return;
      path.mathboardInkMode = this.inkMode;
    },
    _inkSnapshot(object) {
      if (!object || this._boardObjectPolicy.isFormula(object)) return null;
      if (object.isType(...STROKE_INK_TYPES)) {
        const snapshot = { stroke: object.stroke, mathboardInkMode: object.mathboardInkMode };
        if (
          object.isType("Circle")
          && object.fill
          && object.fill !== "transparent"
        ) {
          snapshot.fill = object.fill;
        }
        return snapshot;
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
        if (!this.isPanning) this.setCursor(CURSOR_TYPES.grab);
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
      } = chrome;
      const objectChrome = selectionObjectChromeForBoard(this.boardTheme);
      Object.assign(InteractiveFabricObject.ownDefaults, objectChrome);
      this.canvas.selectionColor = selectionColor;
      this.canvas.selectionBorderColor = selectionBorderColor;
      this.canvas.selectionLineWidth = selectionLineWidth;

      this._suspendHistory = true;
      try {
        this.canvas.forEachObject((obj) => applySelectionObjectChrome(obj, objectChrome));
        const active = this.canvas.getActiveObject();
        if (active?.isType?.("ActiveSelection")) {
          applySelectionObjectChrome(active, objectChrome);
        }
      } finally {
        this._suspendHistory = false;
      }
      this.canvas.requestRenderAll();
    },
    _panelAllowed() {
      if (this.selectionPanelSuspended || this._selectionGesture || this.isPanning) return false;
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
    onSelectionChanged() {
      this.emitSelectionColor();
      this.refreshSelectionPanel();
    },
    onSelectionCleared() {
      this.refreshSelectionPanel();
    },
    onSelectionPointerUp() {
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
    async _cloneForDuplicate(object) {
      const placed = snapshotObject(object);
      const clone = await object.clone(FORMULA_CLONE_PROPS);
      clone.set({
        ...placed,
        left: placed.left + DUPLICATE_OFFSET,
        top: placed.top + DUPLICATE_OFFSET,
      });
      FORMULA_CLONE_PROPS.forEach((key) => {
        if (object[key] !== undefined) clone[key] = object[key];
      });
      // Duplicate always gets fresh identity (including nested board groups).
      regenerateMathBoardObjectIds(clone);
      clone.setCoords();
      return clone;
    },
    _selectDuplicates(clones) {
      if (clones.length === 1) {
        this.canvas.setActiveObject(clones[0]);
        return;
      }
      const selection = new ActiveSelection(clones, { canvas: this.canvas });
      this.canvas.setActiveObject(selection);
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
      if (!this.canvas) return;
      const active = this.canvas.getActiveObject();
      if (!active || active.isEditing) return;
      const sources = this.canvas.getActiveObjects().slice();
      if (!sources.length) return;

      let clones;
      try {
        clones = await Promise.all(sources.map((object) => this._cloneForDuplicate(object)));
      } catch (error) {
        console.error("Duplicate failed", error);
        return;
      }
      if (!this.canvas || clones.some((clone) => !clone)) return;
      const stillThere = sources.every((object) => this.canvas.getObjects().includes(object));
      if (!stillThere) return;

      this._suspendHistory = true;
      try {
        clones.forEach((clone) => this.canvas.add(clone));
        this._selectDuplicates(clones);
      } catch (error) {
        clones.forEach((clone) => {
          if (this.canvas.getObjects().includes(clone)) this.canvas.remove(clone);
        });
        console.error("Duplicate failed", error);
        return;
      } finally {
        this._suspendHistory = false;
      }

      const entries = clones
        .map((object) => ({ object, index: this.canvas.getObjects().indexOf(object) }))
        .filter((entry) => entry.index >= 0);
      if (entries.length) this._pushCommand({ type: "duplicate", entries });
      this.canvas.requestRenderAll();
      this.refreshSelectionPanel();
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
    async _buildFormulaFromStamp(spec) {
      const formula = await this._buildFormulaObject(
        { latex: spec.latex },
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
      // Ink mode is semantic; vector formulas apply destination ink via applyInk.
      applyMaterializedFormulaMetadata(formula, spec);
      return formula;
    },
    async _materializeStamp(encoded) {
      const doc = decodeStampString(encoded);
      return materializeStampDocument(doc, {
        buildFormula: (spec) => this._buildFormulaFromStamp(spec),
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
    _applyBoardDefaultInkToStampTree(root) {
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

      regenerateMathBoardObjectIds(objects);
      const group = this._wrapAsStampGroup(objects);
      regenerateMathBoardObjectIds(group);
      this._applyBoardDefaultInkToStampTree(group);
      this._placeGroupAtViewportCenter(group);
      this.canvas.add(group);
      this.canvas.setActiveObject(group);
      this.canvas.requestRenderAll();
      this._recordAdd(group);
      this.refreshSelectionPanel();
      trackBoardEngaged();
      recordProductAction();
      trackEvent(ANALYTICS_EVENTS.OBJECT_CREATED, {
        object_type: "stamp",
      });
      return { ok: true, group };
    },
    _resetHistory() {
      this._history = [];
      this._historyStep = -1;
      this._pendingTransform = null;
      this._pendingText = null;
      this._uncommittedText = null;
      this._historyTipKind = "command";
    },
    _clearBoardContents() {
      if (!this.canvas) return;
      this.canvas.discardActiveObject();
      const objects = this.canvas.getObjects().slice();
      this._suspendHistory = true;
      try {
        objects.forEach((object) => this.canvas.remove(object));
      } finally {
        this._suspendHistory = false;
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
      regenerateMathBoardObjectIds(objects);
      const group = this._wrapAsStampGroup(objects);
      regenerateMathBoardObjectIds(group);
      this._applyBoardDefaultInkToStampTree(group);
      this._placeGroupAtViewportCenter(group);
      this.canvas.add(group);
      this.canvas.setActiveObject(group);
      this.canvas.requestRenderAll();
      this._recordAdd(group);
      this.refreshSelectionPanel();
      trackBoardEngaged();
      recordProductAction();
      trackEvent(ANALYTICS_EVENTS.OBJECT_CREATED, {
        object_type: "stamp_template",
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
      if (!this.canvas) return false;
      const active = this.canvas.getActiveObject();
      if (!active || !active.isType("ActiveSelection")) return false;
      const members = active.getObjects().slice();
      if (members.length < 2) return false;

      const memberEntries = members
        .map((object) => ({
          object,
          index: this.canvas.getObjects().indexOf(object),
        }))
        .filter((entry) => entry.index >= 0)
        .sort((a, b) => a.index - b.index);
      if (memberEntries.length < 2) return false;

      this.canvas.discardActiveObject();
      this._suspendHistory = true;
      let group;
      try {
        memberEntries.forEach(({ object }) => this.canvas.remove(object));
        group = new Group(
          memberEntries.map((entry) => entry.object),
          { subTargetCheck: false, interactive: false },
        );
        // New group identity; children keep theirs.
        ensureMathBoardObjectId(group);
        this.canvas.add(group);
        this.canvas.setActiveObject(group);
      } finally {
        this._suspendHistory = false;
      }

      const index = this.canvas.getObjects().indexOf(group);
      if (index < 0) return false;
      this._pushCommand({
        type: "group",
        group,
        index,
        members: memberEntries,
      });
      this.canvas.requestRenderAll();
      this.refreshSelectionPanel();
      trackBoardEngaged();
      recordProductAction();
      return true;
    },
    ungroupSelection() {
      if (!this.canvas) return false;
      const active = this.canvas.getActiveObject();
      // Use semantic Board Group check: a Formula may be a Fabric Group.
      if (!this._boardObjectPolicy.isBoardGroup(active)) {
        return false;
      }

      const group = active;
      const groupIndex = this.canvas.getObjects().indexOf(group);
      if (groupIndex < 0) return false;

      // Match history undo: discard before removeAll so children return to
      // canvas plane rather than selection/group local coordinates.
      this.canvas.discardActiveObject();
      this._suspendHistory = true;
      let items;
      try {
        items = group.removeAll();
        this.canvas.remove(group);
        items.forEach((object) => this.canvas.add(object));
      } finally {
        this._suspendHistory = false;
      }

      const members = items
        .map((object) => ({
          object,
          index: this.canvas.getObjects().indexOf(object),
        }))
        .filter((entry) => entry.index >= 0);

      this._pushCommand({
        type: "ungroup",
        group,
        index: groupIndex,
        members,
      });

      const objectChrome = selectionObjectChromeForBoard(this.boardTheme);
      items.forEach((object) => applySelectionObjectChrome(object, objectChrome));

      if (items.length > 1) {
        this.canvas.setActiveObject(new ActiveSelection(items, { canvas: this.canvas }));
      } else if (items.length === 1) {
        this.canvas.setActiveObject(items[0]);
      } else {
        this.canvas.discardActiveObject();
      }
      this.canvas.requestRenderAll();
      this.refreshSelectionPanel();
      trackBoardEngaged();
      recordProductAction();
      return true;
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
      this.isPanning = false;
      this.canvas.off('mouse:down', this.startPanning);
      this.canvas.off('mouse:move', this.continuePanning);
      this.canvas.off('mouse:up', this.stopPanning);
      this.canvas.off('touch:start', this.startPanning);
      this.canvas.off('touch:move', this.continuePanning);
      this.canvas.off('touch:end', this.stopPanning);
      
      this.canvas.selection = true;
      this.setObjectsSelectable(true);
      // The board fills the viewport. Touch drags select and move; they do not
      // scroll the page. Pan uses the same flag and moves the viewport itself.
      this.canvas.allowTouchScrolling = false;
    },
    startPanning(opt) {
      if (this.selectedTool !== 'pan') return;
      
      const evt = opt.e;
      evt.preventDefault();
      this.isPanning = true;
      this._hideSelectionPanel();
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
      this.refreshSelectionPanel();
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
    async _buildFormulaObject(formulaData, position) {
      try {
        return await this._formulaRenderer.render({
          latex: formulaData.latex,
          html: formulaData.html,
          position,
          ink: this.boardThemeConfig.defaultInk,
          inkIsLight: this.boardThemeConfig.inkIsLight,
        });
      } catch (error) {
        console.error("Formula rendering failed", error);
        return null;
      }
    },
    async addFormulaToCanvas(formulaData, position) {
      const img = await this._buildFormulaObject(formulaData, position);
      if (!img) {
        trackEvent(ANALYTICS_EVENTS.FORMULA_RENDER_FAILED, {
          mode: ANALYTICS_FORMULA_MODES.CREATE,
        });
        return false;
      }
      if (!this.canvas) return false;

      this.canvas.add(img);
      this.canvas.setActiveObject(img);
      this.canvas.requestRenderAll();
      this._recordAdd(img);
      trackBoardEngaged();
      recordProductAction();
      trackEvent(ANALYTICS_EVENTS.OBJECT_CREATED, {
        object_type: ANALYTICS_OBJECT_TYPES.FORMULA,
      });
      return true;
    },
    async replaceFormula(existing, formulaData) {
      existing = toRaw(existing);
      if (!existing || !this.canvas) return false;

      // Snapshot before async render. A selected formula may still be in group
      // space; snapshotObject converts to canvas plane.
      const placed = snapshotObject(existing);
      const nextFormula = await this._buildFormulaObject(formulaData, {
        x: placed.left,
        y: placed.top
      });
      if (!nextFormula) {
        trackEvent(ANALYTICS_EVENTS.FORMULA_RENDER_FAILED, {
          mode: ANALYTICS_FORMULA_MODES.EDIT,
        });
        return false;
      }
      if (!this.canvas || !this.canvas.getObjects().includes(existing)) return false;

      // Preserve user transform; intrinsic width/height come from the new SVG.
      const current = snapshotObject(existing);
      const transformPatch = {};
      FORMULA_REPLACEMENT_TRANSFORM_KEYS.forEach((key) => {
        if (current[key] !== undefined) {
          transformPatch[key] = current[key];
        }
      });
      if (existing.opacity !== undefined) {
        transformPatch.opacity = existing.opacity;
      }
      nextFormula.set(transformPatch);
      nextFormula.setCoords();
      // Formula replace creates a new Fabric instance but keeps identity.
      ensureMathBoardObjectId(nextFormula, getMathBoardObjectId(existing));

      const index = this.canvas.getObjects().indexOf(existing);
      this._suspendHistory = true;
      try {
        this._removeRetained(existing);
        this._insertRetained(nextFormula, index);
      } finally {
        this._suspendHistory = false;
      }
      this.canvas.setActiveObject(nextFormula);
      this.canvas.requestRenderAll();
      this._pushCommand({
        type: 'replace',
        index,
        removed: existing,
        added: nextFormula
      });
      trackBoardEngaged();
      recordProductAction();
      trackEvent(ANALYTICS_EVENTS.FORMULA_EDITED);
      return true;
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
      
      // markRaw: currentShape lives in data(); a Vue proxy on the canvas
      // breaks Fabric ActiveSelection identity checks (objects jump on select-all).
      this.currentShape = markRaw(this.createShape(pointer.x, pointer.y, 0, 0));
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
      if (shape) {
        shape.setCoords();
        this._recordAdd(shape);
        trackBoardEngaged();
        recordProductAction();
        trackEvent(ANALYTICS_EVENTS.OBJECT_CREATED, {
          object_type: ANALYTICS_OBJECT_TYPES.SHAPE,
          shape: this.selectedShape,
        });
      }
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

      trackEvent(ANALYTICS_EVENTS.TEXT_CREATION_STARTED);

      // Enter editing mode immediately
      this.$nextTick(() => {
        text.enterEditing();
        text.selectAll();
        text.hiddenTextarea?.focus();
      });

      // One-shot: only the initial creation session may commit or cancel.
      const finalizeInitialText = () => {
        text.off('editing:exited', finalizeInitialText);

        if (this._uncommittedText !== text) return;

        this._uncommittedText = null;

        if (text.text.trim() === '' || text.text === DEFAULT_TEXT_CONFIG.content) {
          this._removeRetained(text);
          trackEvent(ANALYTICS_EVENTS.TEXT_CREATION_CANCELLED);
        } else {
          this._recordAdd(text);
          trackBoardEngaged();
          recordProductAction();
          trackEvent(ANALYTICS_EVENTS.OBJECT_CREATED, {
            object_type: ANALYTICS_OBJECT_TYPES.TEXT,
          });
        }
        this.canvas.requestRenderAll();

        // Disabilita immediatamente il text insertion per evitare creazione di nuovo testo
        this.disableTextInsertion();

        // Emit event to switch to select tool
        this.$emit('text-editing-completed');
      };

      text.on('editing:exited', finalizeInitialText);
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

      // Permanent Groups (stamps) and ActiveSelection: recolor leaf members.
      const targets = flattenInkTargets([active]);

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

      if (active.isType("ActiveSelection") || active.isType("Group")) {
        active.set("dirty", true);
      }

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

      const deletionMetadata = buildObjectDeletedMetadata(
        entries.map(({ object }) => object),
        (object) => this._boardObjectPolicy.kindOf(object),
      );

      this.canvas.discardActiveObject();
      entries.forEach(({ object }) => this.canvas.remove(object));
      this.canvas.requestRenderAll();
      this._pushCommand({ type: 'delete', entries });
      trackBoardEngaged();
      recordProductAction();
      trackEvent(ANALYTICS_EVENTS.OBJECT_DELETED, deletionMetadata);
      this.refreshSelectionPanel();
      this._focusBoard();
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
      this._notifyDocumentChanged();
    },
    _recordAdd(object) {
      if (!object || !this.canvas) return;
      this._ensureObjectId(object);
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

        if (command.type === 'duplicate') {
          if (direction === 'forward') {
            command.entries.forEach(({ object, index }) => this._insertRetained(object, index));
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
    },
    _runHistory(direction) {
      if (!this.canvas) return null;
      if (direction === 'undo' && this._historyStep < 0) return null;
      if (direction === 'redo' && this._historyStep >= this._history.length - 1) return null;

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
      this.refreshSelectionPanel();
      return command;
    },
    undo() {
      const command = this._runHistory('undo');
      if (!command) return;
      this._notifyDocumentChanged();
      trackEvent(ANALYTICS_EVENTS.UNDO_USED, { command_type: command.type });
    },
    redo() {
      const command = this._runHistory('redo');
      if (!command) return;
      this._notifyDocumentChanged();
      trackEvent(ANALYTICS_EVENTS.REDO_USED, { command_type: command.type });
    },
    onPathCreated({ path }) {
      this._recordAdd(path);
      trackBoardEngaged();
      recordProductAction();
      trackEvent(ANALYTICS_EVENTS.OBJECT_CREATED, {
        object_type: ANALYTICS_OBJECT_TYPES.PATH,
      });
    },
    onBeforeTransform({ transform }) {
      if (!this._selectionGesture) {
        this._selectionGesture = true;
        this._hideSelectionPanel();
      }
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
      this._hideSelectionPanel();
      if (!target || target === this._uncommittedText) return;
      this._pendingText = { object: target, before: snapshotObject(target) };
      trackEvent(ANALYTICS_EVENTS.TEXT_EDIT_STARTED);
    },
    onTextEditingExited() {
      this.refreshSelectionPanel();
    },
    onObjectModified(opt) {
      this._selectionGesture = false;
      try {
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
        trackEvent(ANALYTICS_EVENTS.TEXT_EDITED);
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
      this.refreshSelectionPanel();
    },
    selectionPanelSuspended() {
      this.refreshSelectionPanel();
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
div#boardcontainer:focus {
  outline: none;
}
.selection-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}
canvas {
  width: 100%;
  height: 100%;
}
</style>
