# 0013. Recoverable board Trash with 30-day retention

- Status: Accepted
- Date: 2026-11-16
- Supersedes: ADR 0006 decision 6 (irreversible UI Delete without a restore bin); retains ADR 0006 Archive rules and ADR 0007 active-board fallback.

## Context

F005 autosaves editable boards into local IndexedDB, but confirmed UI Delete physically removed records. The owner requests a recovery window and removal of Trash records older than 30 days. Keep the smallest local-first change.

## Decision

1. A BoardRecord can have optional `deletedAt` metadata. UI **Move to Trash** sets this timestamp while preserving BoardDocument and semantic IDs.
2. Recent and Archived views omit deleted records. Trash shows them. **Restore** removes `deletedAt` and preserves prior `archivedAt`, returning the record to Archived if applicable.
3. **Permanently delete** is available in Trash with explicit UI confirmation. The existing `boards.delete({ boardId, confirm: true })` local-agent command remains physically destructive for compatibility; new Trash operations are limited to the shared UI/workspace service.
4. Automatic removal applies only if `Date.parse(deletedAt) < Date.parse(now) - 30 * 24h`. Run cleanup at bootstrap and on Trash reads, without background timers.
5. Cleanup uses the repository's revision-fenced delete. Stale candidates changed by another writer are skipped; unexpected storage errors appear in Trash and are logged but do not prevent startup.
6. Invalid timestamps are retained. Historical `trashedAt` remains an Archive marker without retroactive expiration. Normal saved and archived boards never expire.
7. Trashed boards cannot be opened, edited/autosaved, renamed, archived or unarchived before restoration. Trashing the active board follows ADR 0007's validated fallback and rollback behavior.
8. Trash is not a backup. Clearing local data or losing the device still destroys all board records.

## Consequences

- UI deletion becomes recoverable; Trash entries expire after 30 full elapsed days when the app next runs cleanup.
- No new IndexedDB schema, parallel document store, cloud dependency, history service or migrations.
- A long-closed app may delete expired Trash on its next launch, not at an exact wall-clock instant.

## Alternatives rejected

- Reuse Archive for deletion: conflates organization with accidental deletion.
- Timed scratch pruning, periodic background jobs, snapshots, version history, batch Empty Trash and changing the meaning of the existing agent delete command: unnecessary or incompatible with the accepted scope.
