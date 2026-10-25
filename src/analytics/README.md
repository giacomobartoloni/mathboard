# MathBoard web and desktop analytics

A single semantic analytics adapter over [Simple Analytics](https://www.simpleanalytics.com/) for product events. Call sites depend only on `src/analytics/index.js`, never the vendor SDK or the Tauri command. Browser and desktop transports are isolated behind the same interface.

## Public API

| Function | Purpose |
| --- | --- |
| `initializeAnalytics()` | Idempotently initialize the selected transport (the web transport loads the script; desktop has no script bootstrap). Never throws. |
| `trackEvent(name, metadata?)` | Fire a custom event with flat primitive metadata. |
| `trackBoardEngaged()` | Once per page load (`board_engaged`). |
| `recordProductAction()` | In-memory action counter; emits `usage_milestone` at 5 / 20 / 50. |
| `isAnalyticsEnabled()` | Whether a transport was selected for the current production runtime. |

Event name and payload constants live in `events.js` (`ANALYTICS_EVENTS`, `ANALYTICS_OBJECT_TYPES`, `ANALYTICS_SHAPES`, `ANALYTICS_FORMULA_MODES`, `ANALYTICS_FORMULA_CLOSE_REASONS`, `ANALYTICS_FORMULA_ASSIST_SOURCES`, `ANALYTICS_FORMULA_PALETTE_GROUPS`, `ANALYTICS_STAMP_SHARE_FAILURE_STAGES`, `ANALYTICS_MILESTONES`).

## Enablement gate

Selection occurs once at module startup when `import.meta.env.PROD` and `window` is defined. Packaged Tauri chooses the desktop transport (`runtime=desktop`); the canonical `mathboard.app` hostname chooses the web transport (`runtime=web`). Local/dev and non-production web hosts select no transport. The desktop transport sends semantic events only, not pageviews. Offline failures are ignored; there is no retry queue or persistent tracking identifier. Both transports use the same `mathboard.app` Simple Analytics property with `app_version`. Tauri's WebView CSP still blocks third-party scripts and connections.

## Transport boundaries

- `index.js`: public API, event normalization, engagement/milestone counters. No vendor or native calls.
- `selectTransport.js`: one-time, pure transport selection. No vendor calls.
- `transports/web.js`: Simple Analytics queue and script bootstrap for the production website.
- `transports/desktop.js`: fire-and-forget invocation of the Tauri analytics command.
- `src-tauri/src/analytics.rs`: fixed HTTPS destination, bounded flat payload validation and a shared three-second-timeout HTTP client.
- `src-tauri/src/lib.rs`: native command registration only.

The transport may fail without interrupting an editor gesture. Desktop analytics does not cache or retransmit events while offline. See `tests/analytics-transports.test.js` and the native tests in `analytics.rs`.

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

## Stamp share funnel

Measure share-link generation → Copy button → shared-link open, plus technical failures by workflow stage. Do **not** send share URLs, Stamp payloads, board content, coordinates, error messages, or share/session IDs. There is no causal stitching between sender `created`/`copied` and receiver `opened`.

| User action | Event | Metadata |
| --- | --- | --- |
| Share link generated and modal opened | `stamp_share_created` | none |
| Copy button succeeds | `stamp_share_copied` | none |
| Incoming `#s=` / `?s=` materializes successfully | `stamp_share_opened` | none |
| Export/serialize selection fails | `stamp_share_failed` | `stage=export_selection` |
| Payload → URL build fails | `stamp_share_failed` | `stage=build_url` |
| Copy button fails | `stamp_share_failed` | `stage=copy` |
| Incoming payload fails to materialize | `stamp_share_failed` | `stage=open` |

`stage` values come from `ANALYTICS_STAMP_SHARE_FAILURE_STAGES`: `export_selection`, `build_url`, `copy`, `open`.

### Share generation funnel

```text
export selection
    ↓
build share URL
    ↓
stamp_share_created
    ↓
Copy button
    ↓
stamp_share_copied
```

### Shared open funnel

```text
incoming #s= / ?s=
    ↓
bootstrapFromStamp
    ↓
stamp_share_opened
    ↓
object_created { object_type: stamp_template }
```

### Semantics

- `stamp_share_created` means a share URL was generated and shown in the modal, not that the link was externally shared.
- `stamp_share_copied` means the modal **Copy** button succeeded. Manual selection / Cmd+C / context-menu copies are not tracked.
- `stamp_share_opened` means successful materialization of an incoming Stamp deep link. Presence of `#s=` alone is not enough.
- `stamp_share_failed` is a technical reliability signal for the named stage. `Nothing is selected` remains a silent precondition no-op and is **not** counted as failure.
- Keep `object_created` with `object_type=stamp_template` on successful open; do not replace it with `stamp_share_opened`.
- Do not emit modal open/close, hover, or share-attempted events in this funnel.

## Object deletion

`object_deleted` counts one delete gesture, not one event per object.

MathBoard builds the following metadata for every delete gesture:

- `selection_count`
- `object_type`
- `path_count`
- `shape_count`
- `text_count`
- `formula_count`
- `group_count`
- `unknown_count`

At the MathBoard adapter boundary all `*_count` fields are numeric and included, including zero values.

Simple Analytics does not retain falsy metadata values, so numeric zero counts may be absent from stored/exported event metadata.

For `object_deleted` events carrying `object_type`, interpret a missing `*_count` field as zero. Older `object_deleted` events without `object_type` predate this schema and their missing count fields mean "not collected", not zero.

Before provider-side metadata filtering, MathBoard guarantees:

```text
selection_count
=
path_count + shape_count + text_count
+ formula_count + group_count + unknown_count
```

`object_type` is the sole type for homogeneous selections and `mixed` for heterogeneous selections. Allowed values: `path`, `shape`, `text`, `formula`, `group`, `unknown`, `mixed`.

Classification uses `BoardObjectPolicy.kindOf()` only. Groups are counted atomically; members are not recursively counted. Stamps deleted as board groups count as `group`. Non-allowlisted kinds fall into `unknown_count`.

Homogeneous example (3 pencil strokes) as built by MathBoard:

```js
{
  selection_count: 3,
  object_type: 'path',
  path_count: 3,
  shape_count: 0,
  text_count: 0,
  formula_count: 0,
  group_count: 0,
  unknown_count: 0,
}
```

The homogeneous example above may appear in Simple Analytics with only:

```text
selection_count = 3
object_type = path
path_count = 3
```

The absent `shape_count`, `text_count`, `formula_count`, `group_count`, and `unknown_count` values are zero for this post-schema event.

Mixed example:

```js
{
  selection_count: 5,
  object_type: 'mixed',
  path_count: 3,
  shape_count: 0,
  text_count: 1,
  formula_count: 1,
  group_count: 0,
  unknown_count: 0,
}
```

Undo/redo continue as `undo_used` / `redo_used` only — they must not re-emit `object_deleted`. Board clear during Stamp bootstrap must not emit `object_deleted`.

## Ownership

All Simple Analytics interaction goes through this module. Do not call `window.sa_event` or inject the CDN script elsewhere in the app.
