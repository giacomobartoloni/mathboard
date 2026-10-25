# 0008. Board Library storage messaging

- Status: Accepted
- Date: 2026-10-25

## Decision

Display a concise local storage notice in Board Library.
An info control explains browser or Tauri storage, no device sync,
and the risk of losing local data.

Keep local save acknowledgments separate from future cloud sync states.
Cloud sync will be optional; an account must not trigger uploads by default.
Sync, backups, and sharing are distinct capabilities.

The current build only renders sync-off; no backend or toggle is added.

## UI contract

The existing Board Library footer presents two distinct facts: where
board documents are stored, and whether they are synchronized. The
default is "Saved on this device" plus "No cloud sync".
An accessible info button expands an explanation of local-only storage
and potential local data loss.

The wording changes between browser-site storage and the Tauri app;
there is no extra onboarding modal or toolbar banner.
