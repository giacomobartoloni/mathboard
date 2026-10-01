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

Allowed values are **flat primitives only**: `string`, `boolean`, or finite `number`.

Forbidden (dropped by the adapter if passed):

- Nested objects or arrays
- `null` / `undefined` / functions
- LaTeX source, free-text content, coordinates, canvas JSON, object IDs, stack traces, or any other PII / high-cardinality payloads

## Frequency

Do **not** emit high-frequency events (pointer moves, pan/zoom ticks, per-frame updates, keystrokes). Prefer discrete product actions and milestones.

## Ownership

All Simple Analytics interaction goes through this module. Do not call `window.sa_event` or inject the CDN script elsewhere in the app.
