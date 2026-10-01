# 0003. Stamp strings are a transfer format

- Status: Accepted
- Date: 2026-10-02

## Context

MathBoard history is an in-memory command log that retains Fabric instances
([0001-command-log-history.md](0001-command-log-history.md)). That design rejects
full-canvas JSON snapshots for undo. Teachers still need a portable way to share
a set of board objects: built-in kits (cartesian plane, unit circle), URL deep
links, and later export/import.

## Decision

A **stamp** is a versioned JSON document encoded as **base64url**. It is a
**transfer format** only. Decode + materialize produces new Fabric instances;
insert records one command-log `add` of a permanent `Group`. Formulas store
`latex` and re-render their bitmap on import. Colors are absolute per object.

**URL bootstrap** (`#s=<payload>`) and **templates** clear the board and reset
the command log, then insert. That reset is intentional: opening a shared
template starts a new session, not an undoable replace of the previous board.
After a successful load the app strips `s` from the URL via `history.replaceState`.

Toolbar stamps call `insertStamp` and do not clear the board.

## Consequences

- Undo of an insert removes the whole stamp group in one step.
- Persisting the command log remains a separate design; stamp strings are not
  the undo payload.
- Very large stamps may exceed browser URL length limits; hosting or kit-id
  aliases are future work. Decode enforces a 256 KB UTF-8 JSON size cap.

## Alternatives considered

- Fabric `toJSON` / `loadFromJSON` as the share format. Rejected for stamps
  because formulas would ship bitmaps, and the custom schema keeps latex and
  size limits explicit.
- Reusing stamp JSON inside the history stack. Rejected; see ADR 0001.
