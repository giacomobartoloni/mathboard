# 0006. Board library lifecycle: autosave, archive and delete

- Status: Accepted
- Date: 2026-10-23
- Supersedes: ADR 0005 provisions 17–18 (scratch/saved retention and 30-day scratch pruning); does not replace its BoardDocument contract

## Context

ADR 0005 defined `scratch` and `saved` BoardRecord kinds to separate
recoverable autosave from deliberate retention. In actual board-library use,
both were already persisted in IndexedDB. The distinction was confusing:
users reasonably expect a board to be saved once the local write succeeds.
A background 30-day scratch pruning policy could also discard lessons without
an explicit deletion choice.

## Decision

1. Every board successfully committed to IndexedDB is retained in the local
   library without an additional Save action. The UI does not expose
   `scratch` versus `saved` as a board lifecycle choice.
2. An in-progress write is not a successful save. The existing
   `clean`/`dirty`/`saving`/`error` persistence states remain the source
   of truth for save acknowledgments; IndexedDB is not a remote backup.
3. Remove automatic scratch pruning, including the 30-day rule. Old
   `kind: scratch` records must remain accessible; new records use
   `kind: saved` for compatibility with the existing repository schema.
4. Archive is a reversible visibility choice tracked through
   `archivedAt` BoardRecord metadata. It preserves the BoardDocument and
   every semantic object ID. Archived records are omitted from ordinary
   library lists and can be unarchived later.
5. Legacy `trashedAt` records are treated as archived on read; unarchiving
   removes both `archivedAt` and `trashedAt` to avoid losing prior data.
6. Delete is an irreversible explicit user action that removes the record
   from IndexedDB, without a restore bin. The UI requires a second
   confirmation; the development-agent method requires `confirm: true`.
7. Archiving or deleting the active board first persists a fresh blank
   active board. Failure to persist its replacement must block removal of
   the current board.
8. If another tab archived or deleted the active board, a subsequent
   autosave must not recreate or unarchive the record. Fail rather than
   silently losing that lifecycle choice.
9. The active board remains tab-scoped via `sessionStorage`. Full
   conflict-safe cross-tab editing remains outside this decision.
10. No cloud, remote MCP, export, or account requirement is introduced.

## Consequences

- The library has two independent notions: save status (storage acknowledgment)
  and organization (active or archived).
- Previously autosaved board data is retained instead of expiring by age.
- Delete from this browser or desktop installation is irreversible to the
  application. Clearing browser or app data may also remove stored boards.
- Portable board backups remain a separate feature (F034).
- Further work may add a reactive per-board save-status indicator, stronger
  cross-tab fencing, and recovery from failed persistence operations.
