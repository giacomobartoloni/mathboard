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
