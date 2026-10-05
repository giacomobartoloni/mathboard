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

Event name and payload constants live in `events.js` (`ANALYTICS_EVENTS`, `ANALYTICS_OBJECT_TYPES`, `ANALYTICS_SHAPES`, `ANALYTICS_FORMULA_MODES`, `ANALYTICS_FORMULA_CLOSE_REASONS`, `ANALYTICS_FORMULA_ASSIST_SOURCES`, `ANALYTICS_FORMULA_PALETTE_GROUPS`, `ANALYTICS_MILESTONES`).

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
- Free text from the board (including Text tool content, selected text, text length, word count, or character count)
- Coordinates, path/stroke data, canvas JSON, or bitmaps
- Emails, user IDs, fingerprints, or other persistent identifiers
- Full error stacks or messages that may contain user input

If a future event needs metadata, choose a small set of controlled values; do not rely on the adapter to strip sensitive strings.

## Frequency

Do **not** emit high-frequency events (pointer moves, pan/zoom ticks, per-frame updates, keystrokes). Prefer discrete product actions and milestones.

## Text funnel

Measure Text intent → create start → commit or cancel, and edit start → real change. Events carry **no metadata**. Do **not** send text content, length, word/character counts, selection content, coordinates, or canvas data.

| User action | Event | Metadata |
| --- | --- | --- |
| Select Text tool (toolbar or `T`) | `text_tool_selected` | none |
| Click empty board; placeholder IText added | `text_creation_started` | none |
| Exit initial editing with real text | `object_created` | `object_type=text` |
| Exit initial editing empty/default placeholder | `text_creation_cancelled` | none |
| Enter editing on committed text | `text_edit_started` | none |
| Exit editing with a real snapshot change | `text_edited` | none |

### Create funnel

```text
text_tool_selected
    ↓
text_creation_started
    ↓
object_created { object_type: text }
```

Cancellation:

```text
text_creation_started
    ↓
text_creation_cancelled
```

### Edit funnel

```text
text_edit_started
    ↓
text_edited
```

### Semantics

- `text_tool_selected` counts explicit selections (including shortcut `T`), not unique users. Auto-switch to Select after create must **not** emit it.
- `object_created` with `object_type=text` means first commit of a new text object only. Later edits must not re-emit it.
- `text_edit_started` is for committed text only (skips the initial create editing session).
- `text_edited` requires a real snapshot change; transform/recolor/duplicate are not text edits.
- Do not emit keystrokes, cursor, or selection events.

## Formula funnel

Measure Formula intent → open → assist interaction → submit → success/failure, separately from create/edit cancellation. Do **not** send LaTeX, formula HTML, coordinates, error messages, or user identifiers.

| User action | Event | Metadata |
| --- | --- | --- |
| Select Formula tool | `formula_tool_selected` | none |
| Click board to create formula | `formula_modal_opened` | `mode=create` |
| Double-click existing formula | `formula_modal_opened` | `mode=edit` |
| Click Quick insert | `formula_assist_used` | `mode`, `source=quick_insert` |
| Click palette item | `formula_assist_used` | `mode`, `source=palette`, `group` |
| Valid Insert / Cmd+Enter | `formula_submitted` | `mode` |
| Formula added to board | `object_created` | `object_type=formula` |
| Formula edit replaced on board | `formula_edited` | none |
| Close without submit | `formula_modal_cancelled` | `mode`, `reason` |
| Post-submit bitmap conversion fails | `formula_render_failed` | `mode` |

`mode` is `create` or `edit`. `reason` is one of `cancel_button`, `close_button`, `backdrop`, `escape`. Palette `group` is one of `symbols`, `greek`, `relations`.

### Create funnel

```text
formula_tool_selected
    ↓
formula_modal_opened { mode: create }
    ↓
formula_submitted { mode: create }
    ↓
object_created { object_type: formula }
```

Failure after submit:

```text
formula_submitted { mode: create }
    ↓
formula_render_failed { mode: create }
```

Cancellation:

```text
formula_modal_opened { mode: create }
    ↓
formula_modal_cancelled { mode: create, reason }
```

### Edit funnel

```text
formula_modal_opened { mode: edit }
    ↓
formula_submitted { mode: edit }
    ↓
formula_edited
```

### Semantics

- `formula_submitted` is intent after a valid Insert; it is **not** board success. Create success remains `object_created` with `object_type=formula`; edit success remains `formula_edited`.
- Submit must **not** emit `formula_modal_cancelled`. `insert-formula` and `close` are separate modal outcomes.
- `formula_assist_used` counts assisted **clicks**, not assisted formula sessions. Do not treat assist count / submit count as a per-session conversion rate.
- Do not emit live KaTeX preview errors, keystrokes, hover, or palette-tab browsing events.
- Interpret counts as aggregates (Simple Analytics). Do not stitch events with user or session IDs.

## Ownership

All Simple Analytics interaction goes through this module. Do not call `window.sa_event` or inject the CDN script elsewhere in the app.
