# 0009. Use Tauri 2 as a thin desktop shell

- Status: Accepted
- Date: 2026-10-01

## Context

MathBoard is a Vue and Vite application whose production artifact is `dist/`. Native
distribution should preserve the web implementation rather than introduce a second
frontend or move application behavior into a platform-specific layer.

MathBoard already supports semantic BoardDocument snapshots, IndexedDB storage,
and autosave (ADR 0005). The active board identity is tab/session scoped, and the
undo/redo command history is memory-only. Tauri reuses that web persistence model
without introducing a second desktop-specific document store.

## Decision

Use Tauri 2 as a thin desktop host around the same Vue application and Vite build used
for the web deployment. `src-tauri/tauri.conf.json` runs the existing npm development
and build commands and packages `../dist`.

The desktop application identifier is `app.mathboard.desktop`. The main window receives
Tauri's core defaults plus narrowly scoped opener access for HTTPS and `mailto:` URLs.
Application features and business rules remain in JavaScript; Rust owns native platform
boundaries. ADR 0010 defines the additional main-WebView-only analytics command.

Desktop and web builds share source, assets, and behavior. Platform-specific CI compiles
the host without producing signed installers.

## Consequences

- One frontend serves Cloudflare web deployment and native desktop packages.
- Desktop builds require Node.js, Rust, and platform-native Tauri prerequisites.
- Native WebView differences require manual testing on macOS, Windows, and Linux.
- The identifier must be treated as stable because changing it creates a distinct
  application identity for operating systems, signing, and future updates.
- Tauri capabilities and CSP remain part of the desktop security boundary.
- The existing IndexedDB-based BoardDocument save/open workflow remains shared;
  undo/redo history is still session-only and is reset on restore.
- The web Privacy Policy link stays on the same origin at `/privacy-policy.html`.
  Desktop opens `https://mathboard.app/privacy-policy.html` in the system browser
  through the scoped opener, so following that link requires network access.

## Non-decisions

This decision does not add SQLite or any new native storage layer, persisted
history, a Rust business layer, an updater, or mobile targets. Desktop analytics is
decided separately in ADR 0010.

## Alternatives considered

- **Electron:** mature and predictable, but ships a browser runtime and is unnecessary
  for this thin host.
- **Separate native clients:** would duplicate the board UI and behavior across
  platforms.
- **Browser-only distribution:** remains supported, but does not provide installable
  desktop artifacts.
