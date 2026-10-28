# 0010. Deliver desktop product events through a confined native transport

- Status: Accepted for implementation; distribution awaits installed-app and provider verification
- Date: 2026-10-26
- Related: ADR 0002 (product analytics), ADR 0009 (Tauri desktop shell)

## Context

The production web app sends semantic product events through the shared analytics
adapter and Simple Analytics browser script. Tauri's WebView CSP deliberately does not
allow direct requests to the provider. Desktop must preserve the event taxonomy and
privacy boundary while using the native runtime for delivery.

The board operation owner and UI interaction owners remain responsible for deciding
when an event has occurred. The transport only delivers those events.

## Decision

`src/analytics/index.js` selects a web or desktop transport at startup. The web
transport retains the production `mathboard.app` host gate and browser-script behavior.
The packaged desktop transport invokes one Tauri command and never loads the provider
script or emits a synthetic pageview. Development builds emit no analytics.

Desktop JavaScript keeps at most four active invocations and 100 pending events in
memory. It drops events when the exposed WebView DNT signal is `1` or `yes`, when
`navigator.onLine` is false, on overflow, or after a delivery failure. It does not
retry or persist events, and editor operations never await delivery. The WebView's
DNT signal may not reflect an operating-system privacy setting.

The Tauri command is granted only to the `main` WebView by a dedicated capability,
checks its caller label and `tauri::is_dev()` again, and validates each event against
a closed, event-specific metadata schema. It refuses unknown names, keys, values,
types, and counts. The WebView cannot supply `runtime` or `app_version`.

Rust adds `runtime=desktop` and the package version, and sends a JSON event to the
fixed Simple Analytics HTTPS endpoint with a reused client. Requests time out after
three seconds and do not follow redirects. An independent four-request native cap
prevents a direct caller from bypassing the JavaScript queue. Failures return only
generic errors and do not change editor results.

## Consequences

- Web and desktop use one taxonomy and one set of board ownership rules.
- The WebView has no provider network permission; native delivery is a narrow boundary.
- No board text, LaTeX, drawing data, coordinates, URLs, user IDs or device IDs are
  accepted as event metadata. The provider still sees ordinary connection data.
- Delivery is best effort. Offline or failed events are lost by design.
- A taxonomy change needs a matching native schema change and privacy review.
- Source tests and compilation do not establish production delivery. Distribution
  requires installed-app checks on macOS, Windows and Linux plus observation in
  Simple Analytics Events Explorer or export, including native version metadata.

## Alternatives considered

- Grant the WebView direct provider network access. This expands its network boundary.
- Accept arbitrary bounded metadata in Rust. Bounded strings can still contain board
  content; event-specific values are required.
- Persist and retry failed events. This adds local telemetry storage and delayed
  collection outside the approved behavior.
- Send desktop pageviews. The desktop experience does not have the web pageview
  lifecycle, and this phase needs only semantic events.
