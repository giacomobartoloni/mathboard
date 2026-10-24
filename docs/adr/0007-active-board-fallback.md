# 0007. Active board fallback after Archive or Delete

- Status: Accepted
- Date: 2026-10-24
- Supersedes: ADR 0006, decision 7 (always create a blank board)

## Context

Archiving or permanently deleting the current board needs a safe, predictable
active-board replacement. Creating a new blank board every time produces
unnecessary "Untitled board" records and distracts from the most recent work.

The existing local IndexedDB repository sorts board records by `updatedAt`
descending. A simple open does not update `updatedAt`; document edits and
renames do.

## Decision

1. When a non-active board is archived/deleted, keep the active board unchanged.
2. When the active board is archived/deleted, flush it and select the first
   remaining **unarchived** board in the existing `updatedAt` descending order.
   Archived and legacy trashed boards are not candidates.
3. Opening the candidate must succeed before archiving or deleting the
   previous active board. This uses the existing BoardDocument validation,
   atomic canvas replacement and history reset. If it fails, reject the
   requested archive/delete without changing the previous board.
4. Only when there is no other available unarchived board, persist a fresh
   blank board and make it active before the archive/delete.
5. If the archive/delete storage mutation fails after a successful switch,
   attempt to restore the original board as active and propagate the storage
   error. This rollback is best-effort; cross-tab transactions remain outside
   the current scope.
6. After successful archive/delete of the active board, close the Board
   Library so the user immediately sees the selected replacement.
   Operations on a non-active board keep the library open.
7. Apply the rule in `BoardPersistenceService` beneath the shared
   `BoardWorkspaceService`, so the UI and development-only agent see the
   same behavior. Preserve explicit confirmation for permanent deletion.

## Consequences

- No extra blank records are created during ordinary board organization.
- The new active board is the most recently modified eligible board, not
  necessarily the last opened board.
- Choosing a corrupted or unloadable newest board blocks the operation
  rather than silently skipping to a different board.
- Manual acceptance and automated tests must cover multiple candidates,
  archived exclusions, active/inactive actions, the final-board fallback,
  storage errors and corrupted candidate documents.
