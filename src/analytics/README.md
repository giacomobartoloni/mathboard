# MathBoard web analytics

Thin adapter over [Simple Analytics](https://www.simpleanalytics.com/) for product events. Call sites must use this module only — never `window.sa_event` directly.

## Public API

| Function | Purpose |
| --- | --- |
| `initializeAnalytics()` | Idempotent bootstrap: gate, `sa_metadata`, event queue, script load. Never throws. |
| `trackEvent(name, metadata?)` | Fire a custom event with flat primitive metadata. |
| `trackBoardEngaged()` | Once per page load (`board_engaged`). |
| `recordProductAction()` | In-memory action counter; emits `usage_milestone` at 5 / 20 / 50. |
| `isAnalyticsEnabled()` | Production host gate (exported for clarity). |

Event name and payload constants live in `events.js` (`ANALYTICS_EVENTS`, `ANALYTICS_OBJECT_TYPES`, `ANALYTICS_SHAPES`, `ANALYTICS_MILESTONES`).

## Enablement gate

Analytics runs only when **all** of these are true:

- `import.meta.env.PROD`
- `window` is defined
- `window.location.hostname` is `mathboard.app`

Local/dev and non-production hosts never load the script and never send events.

## Event naming

Use **snake_case** event names from `ANALYTICS_EVENTS` (for example `object_created`, `theme_changed`). Do not invent ad-hoc names at call sites.

## Metadata rules

### What the adapter enforces

`trackEvent` keeps only **flat primitives**: `string`, `boolean`, or finite `number`. Nested objects, arrays, `null`, `undefined`, and functions are dropped. That is a shape check, not a content filter: any string key/value that is a primitive will still be sent.

### What call sites should never send

Product policy (not enforced by the adapter): do not pass board or user content as metadata. Prefer taxonomy enums and aggregate counts from `events.js` (for example `object_type`, `shape`, `selection_count`, `command_type`, `theme`, `actions`).

Avoid in particular:

- LaTeX source or formula HTML
- Free text from the board
- Coordinates, path/stroke data, canvas JSON, or bitmaps
- Emails, user IDs, fingerprints, or other persistent identifiers
- Full error stacks or messages that may contain user input

If a future event needs metadata, choose a small set of controlled values; do not rely on the adapter to strip sensitive strings.

## Frequency

Do **not** emit high-frequency events (pointer moves, pan/zoom ticks, per-frame updates, keystrokes). Prefer discrete product actions and milestones.

## Ownership

All Simple Analytics interaction goes through this module. Do not call `window.sa_event` or inject the CDN script elsewhere in the app.
