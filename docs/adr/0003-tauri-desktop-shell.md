# 0003. Use Tauri 2 as a thin desktop shell

- Status: Accepted
- Date: 2026-10-01

## Context

MathBoard is a Vue and Vite application whose production artifact is `dist/`. Native
distribution should preserve the web implementation rather than introduce a second
frontend or move application behavior into a platform-specific layer.

The board and its command-log history are held in memory. Closing or reloading the
application loses the current document and its undo/redo history; desktop packaging
does not add document persistence. UI preferences such as the selected theme may
persist independently through `localStorage`.

## Decision

Use Tauri 2 as a thin desktop host around the same Vue application and Vite build used
for the web deployment. `src-tauri/tauri.conf.json` runs the existing npm development
and build commands and packages `../dist`.

The desktop application identifier is `app.mathboard.desktop`. The main window is the
only capability target. It receives Tauri's core defaults plus narrowly scoped opener
access for HTTPS and `mailto:` URLs. Application features and business rules remain in
JavaScript; Rust contains only the Tauri bootstrap and plugin registration.

Desktop and web builds share source, assets, and behavior. Platform-specific CI compiles
the host without producing signed installers.

## Consequences

- One frontend serves Cloudflare web deployment and native desktop packages.
- Desktop builds require Node.js, Rust, and platform-native Tauri prerequisites.
- Native WebView differences require manual testing on macOS, Windows, and Linux.
- The identifier must be treated as stable because changing it creates a distinct
  application identity for operating systems, signing, and future updates.
- Tauri capabilities and CSP remain part of the desktop security boundary.
- Board state and history remain session-only; persisted UI preferences do not provide
  an open/save document workflow.
- The web Privacy Policy link stays on the same origin at `/privacy-policy.html`.
  Desktop opens `https://mathboard.app/privacy-policy.html` in the system browser
  through the scoped opener, so following that link requires network access.

## Non-decisions

This decision does not add SQLite or another storage layer, persisted history, a Rust
business layer, an updater, mobile targets, or desktop-specific analytics. Those require
separate decisions.

## Alternatives considered

- **Electron:** mature and predictable, but ships a browser runtime and is unnecessary
  for this thin host.
- **Separate native clients:** would duplicate the board UI and behavior across
  platforms.
- **Browser-only distribution:** remains supported, but does not provide installable
  desktop artifacts.
