# 0005. BoardDocument persistence

- Status: Accepted
- Date: 2026-10-08

## Context

MathBoard needs local Save/Open before a broader Programmable Board Controller.
Stamp ([0003](0003-stamp-transfer-format.md)) is a transfer format that materializes
new instances. Fabric `toJSON` / `loadFromJSON` would persist renderer artifacts
(especially Formula path soup) and couple the product to Fabric serialization.

ADR [0004](0004-semantic-object-model-and-renderer-boundaries.md) already separates
MathBoard semantics from Fabric runtime types and rejects a live parallel
canonical document store. History remains an in-memory command log
([0001](0001-command-log-history.md)).

Save/Open creates the first concrete need for a BoardDocument. The document is a
persistence boundary and snapshot, not a second runtime model continuously
synchronized with Fabric.

## Decision

1. `BoardDocument` is the persistent format of an entire board.
2. It is a snapshot taken on save, not a runtime store kept in sync with Fabric.
3. Stable MathBoard object IDs (`mathboardId`) are preserved across Save/Open of
   the same board.
4. Formula nodes persist LaTeX (and transform/style/ink mode), not MathJax
   vectors or renderer child paths.
5. Group nodes persist hierarchy and child identities.
6. Array order of `objects` (and nested `group.objects`) is canvas z-order
   (index 0 = back).
7. Selection, zoom, pan, tool, modal, and other UI/view state do not belong in
   the document.
8. History is not persisted; a successful open resets the command log.
9. Stamp remains distinct from BoardDocument (transfer vs same-board identity).
10. Save/Open of the same board preserves object identity.
11. Stamp import generates new object identities.
12. Board copy generates a new board ID and fresh object IDs.
13. Validation and migration operate on MathBoard semantic JSON.
14. Open is atomic: materialize off-canvas first; failure leaves the current
    board untouched.
15. Introducing BoardDocument does not invalidate ADR 0004: it is not a live
    canonical store.

Local records live in IndexedDB (`mathboard` / `boards`). A small preference
`mathboard.lastBoardId` may use localStorage. Autosave is driven by document
content changes (history command commit boundaries), not viewport events.

## Consequences

Positive:

- Persistence forces a correct semantic boundary before BoardController/MCP.
- Formula documents stay compact (LaTeX).
- Stamp and BoardDocument share low-level serialize/materialize without sharing
  identity lifecycle.

Costs:

- ActiveSelection members need canvas-plane geometry when serializing.
- Autosave orchestration must avoid concurrent uncontrolled saves.

## Alternatives considered

- Persist via `canvas.toJSON()`. Rejected: renderer coupling, Formula path soup.
- Persist the whole board as a Stamp. Rejected: Stamp means copy/import with new
  identity, not the same board.
- Keep a live BoardDocument synchronized with Fabric. Rejected: dual-store
  complexity without payoff (ADR 0004).
