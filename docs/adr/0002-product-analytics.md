# 0002. Product analytics via a single adapter

- Status: Accepted
- Date: 2026-10-01

## Context

MathBoard needs lightweight product signals (page views and counts of semantic UI events) to understand how the live site is used. Drawing content, typed text, and LaTeX must never leave the device as analytics metadata. The undo/redo command log (ADR 0001) is an in-memory editor mechanism and must not be coupled to product analytics.

Vendor SDKs and transport details should not appear in Vue components. A future desktop or other runtime may need a different transport while keeping the same event names.

## Decision

MathBoard records privacy-conscious semantic product events through a single analytics adapter. Product content is never analytics metadata. The Web transport is Simple Analytics and is enabled only on the canonical production host (`mathboard.app`).

Events use a stable taxonomy of functional categories. Shared globals such as `runtime` and `app_version` may accompany events. MathBoard does not introduce its own persistent user identifiers for these events.

ADR 0001 remains authoritative for history. Analytics must not change command-log semantics, gesture boundaries, or what is stored in the undo stack.

## Consequences

- The taxonomy stays stable across transports; the backend can be replaced without renaming product events.
- Components call the adapter only; they do not import vendor APIs.
- No MathBoard-introduced persistent user IDs are attached to analytics events.
- A future desktop transport can be added behind the same adapter without changing call sites.
- Privacy disclosure (privacy policy and cookie banner copy) must describe cookieless Simple Analytics on the production website accurately and separately from essential local storage for preferences.

## Alternatives considered

- Call Simple Analytics (or another vendor) directly from components. Couples UI to one vendor and makes host gating and event naming inconsistent.
- Gate the production analytics script on the cookie banner's `mathboard_cookie_consent.analytics` flag. That would be a fake gate for a cookieless product-analytics path already described in the privacy policy; consent storage remains for local preference UX only.
- Full-session replay or content-bearing telemetry. Rejected: board content, typed text, and LaTeX must not be analytics metadata.
- No product analytics. Leaves no production signal beyond ad-hoc observation; rejected for the live site while keeping content local.
