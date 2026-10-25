# 0008. Desktop semantic events via a restricted native transport

- Status: Proposed (pending packaged desktop and provider verification)
- Date: 2026-10-25

## Context

ADR 0002 centralizes semantic product analytics behind the Vue adapter and limits the
browser transport to `mathboard.app`. ADR 0006 ships the same Vue frontend in a Tauri 2
WebView, with a CSP that intentionally prevents loading the Simple Analytics script or
sending third-party requests from the WebView. The desktop shell currently emits no
analytics. A desktop-specific event transport is now explicitly in scope.

Simple Analytics documents server-side/mobile event ingestion at
`POST https://queue.simpleanalyticscdn.com/events`. The `hostname` associates events
with the same dashboard; `metadata.runtime` distinguishes native from browser events.

## Decision

- Keep `trackEvent()`, the existing taxonomy and the current web-only script gate.
  For packaged Tauri builds, route custom events through the native Tauri command
  `track_desktop_analytics`. Development builds remain analytics-free.
- The command sends JSON to a fixed HTTPS endpoint, without a general-purpose
  network permission or changes to the WebView CSP. HTTP requests have a three-second
  timeout and redirects disabled.
- The Rust boundary permits only known event names and small, flat, category/count
  metadata. It overwrites `runtime=desktop` and `app_version` using native package data.
  The payload uses `hostname=mathboard.app`, path `/`, and a generic, non-identifying
  desktop user agent. No board content, LaTeX, user identifiers, URL, referrer, device
  identifiers, or local persistence keys are transmitted by MathBoard.
- The JS adapter honors Do Not Track on desktop. It drops events while offline, keeps
  at most four in-flight requests and a bounded 100-event memory backlog, drops
  overflow, and discards buffered events after a transport failure. No persistent
  queue, retries, or blocking await on board actions.
- Native event tracking does not create synthetic desktop pageviews. Reports must
  compare **event counts** across `runtime=web` and `runtime=desktop`, not web
  pageviews or browser device type with desktop app launches.

## Rationale and alternatives

Loading `latest.js` in Tauri was rejected: it would bypass the original host gate,
unnecessarily allow remote scripts in the CSP, and report misleading pageviews.
WebView `fetch` directly to the ingestion endpoint was rejected because CORS and
preflight behavior differs across Tauri WebViews and has not been verified.
The generic Tauri HTTP plugin was not selected: the dedicated Rust command provides
a smaller surface, strict payload validation, and a fixed destination.
Persistent offline retries were rejected to protect privacy and keep offline editing
independent of analytics.

## Consequences and release gates

- No dependency on the external network for application startup or editing.
- A native Rust HTTPS client (`reqwest` with rustls) is required; preserve a coherent
  `Cargo.lock` after dependency resolution and run Rust and desktop CI.
- Validate a packaged desktop build on macOS, Windows and Linux, including offline
  behavior, Do Not Track, native HTTP failures, cold start, and no WebView calls
  to the third-party analytics script.
- Verify real desktop events in Simple Analytics Events Explorer / exported metadata,
  including `runtime=desktop`, `app_version`, and the absence of content-bearing
  fields. Do not claim production analytics delivery from unit tests alone.
- Update the public privacy policy before distributing any desktop release with this
  transport. A desktop opt-out setting and platform metadata are not added here.

## Related decisions

- [0002. Product analytics via a single adapter](0002-product-analytics.md)
- [0006. Tauri desktop shell](0006-tauri-desktop-shell.md)
- [Simple Analytics server-side event ingestion](https://docs.simpleanalytics.com/events/server-side)
