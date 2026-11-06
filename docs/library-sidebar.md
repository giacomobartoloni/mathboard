# Workspace library sidebar: current boundary and future extension

## Current implementation (PR #149)

The top-right **Boards** button opens the only implemented library: locally saved editable boards (F005). The application owns the `closed | overlay | pinned` presentation state, BoardWorkspaceService calls, and analytics for user-driven board actions. `LibrarySidebar.vue` owns the currently board-specific list, search, recent/archived views, creation, and safe lifecycle controls. `DrawBoard.vue` resizes its Fabric viewport when the sidebar is pinned.

`LibrarySidebar.vue` deliberately represents the current single-library sidebar. Its HTML root is an `<aside>` landmark in pinned mode. When opened as a blocking overlay, that **same aside** has `role="dialog"` and `aria-modal="true"` for correct accessible modal semantics; the board is inert. There is no separate modal component, native `<dialog>` lifecycle, or third-party drawer abstraction. The component currently contains both the sidebar frame and Boards-only content; it is not yet a generic library host, and its board-specific search/list/actions are not a reusable interface.

## Naming and ownership

Sidebar presentation uses `librarySidebarMode`, `isLibrarySidebarOpen`, `canPinLibrarySidebar`, `toggleLibrarySidebarPin`, and `library-sidebar-*` CSS names. Its overlay, pinned state, focus and canvas dimensions are not Boards domain concepts.

Boards behavior deliberately keeps `boardLibrary*` names: board lists, lifecycle loading/errors, `openBoardLibrary`, `onBoardLibraryAction` and analytics constrained to `library=boards`. `LibrarySidebar.vue` is named for its presentation responsibility but still renders only the Boards view; it is not yet a reusable host with independent library content. Extract a shared shell only when the proposed F031 Stamp library is actually implemented.

## Adjustable width and centered board viewport

The sidebar uses the familiar desktop split-pane pattern: a subtle **left-edge drag handle** (12px hit area) changes its width, while the same focusable separator supports keyboard `ArrowLeft` (expand), `ArrowRight` (shrink), `Home` (minimum) and `End` (maximum). It exposes the current size and bounds through `aria-valuenow/min/max`. There is no resizer on phone layouts (<=600px); the overlay remains full-width there.

- Default: **400 CSS px**, adjustable from **320–560 px** on desktop. Width is kept only for this running app session; no local preference or persistence schema was added.
- Overlay: resize the sidebar without changing the board canvas or its viewport transform.
- Pinned: reserve the selected width in the workspace and leave **at least 600 CSS px** for drawing. Pin is available from 920px viewport width, and any overwide overlay selection is clamped when pinning. Resizing the browser below the dockable threshold returns to overlay.
- Visual boundary: retain the 1px divider and a modest shadow to the **left** of the pinned sidebar. Do not add a second floating panel or scroll the application.
- **Center-preserving pan:** when a pinned sidebar changes the usable drawing viewport width, `DrawBoard.updateCanvasSize()` adjusts Fabric's viewport X translation by `(newCanvasWidth - previousCanvasWidth) / 2`, including pin, drag resizing, unpin and close. The world point previously at the center stays centered at any zoom. The Y translation, zoom, scene object coordinates, history and saved board document are unchanged. Overlay-only resizing does **not** pan the board.
- Avoid CSS width tweening on every drag frame: Fabric already resizes via `ResizeObserver`. Dragging should feel direct, and pan follows the actual measured canvas width rather than a guessed sidebar dimension.

The earlier overlay-only plan that demanded no viewport-transform changes is superseded **only for pinned resizing** by the owner's explicit center-pan requirement. This remains presentation behavior, not a document edit or undoable object operation.

## Extension seam for F031: personal Stamp library (not implemented)

The ProductPlan already tracks F031 as **proposed**. When a second library has approved product scope and actual data/action semantics:

1. Extract the existing right-edge chrome (header, pin/unpin, close, overlay, focus handling, width and motion) into a shared `LibrarySidebarShell`. It owns presentation only, never board or Stamp persistence. Preserve its overlay/pinned, narrow-viewport and accessibility behaviors.
2. Keep the F005 UI as a **Boards** content component, with its own search, recent/archived views and BoardWorkspaceService operations. Implement a separate **Stamps** content component with its own service. Do not use a type-discriminated mega-component or route Stamp actions through BoardWorkspaceService.
3. Add top-level **Boards / Stamps** navigation *only when Stamps exists*. Keep the Boards-only Recent/Archived selection subordinate to Boards; preserve focus and in-progress state when switching as appropriate. Review whether the top-right trigger should then say **Libraries** instead of **Boards**.
4. Reuse the single sidebar mode and canvas-resize contract rather than mounting two independent sidebars. Keep the storage disclosure accurate for each library and preserve confirmed deletion semantics.
5. Extend `library` analytics taxonomy to `stamps` **only with real Stamp interactions**. Keep identifiers, user-authored titles, Stamp payloads and search queries out of analytics at the JavaScript event owners; the desktop Rust transport does not validate event names or metadata.

This is a refactor-on-demand path, **not** authorization to implement F031. No placeholder tab, speculative plugin registry, generalized repository, new Stamp storage schema, or empty content view belongs in PR #149. Avoid coupling board domain actions to presentation now so extraction stays mechanical later.

## Verification when F031 is implemented

Test cross-library navigation, modal/nonmodal focus and Escape, pin/unpin with canvas transforms intact, short and narrow viewports, persistence isolation and local-only disclosures. Require a separate F031 specification and a new PR, tied to its existing ProductPlan entry.

## Related decisions

- `docs/adr/0002-product-analytics.md`: single privacy-preserving analytics adapter.
- `docs/adr/0008-board-storage-disclosure.md`: local board persistence and no cloud sync.
- `AgentWorklog/mathboard/ProductPlan.md`: F005 (shipped Board Library), F031 (proposed reusable personal Stamp library), D023 (validate demand before creating persistence).
