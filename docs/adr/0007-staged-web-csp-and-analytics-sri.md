# 0007. Staged web CSP and integrity-pinned analytics

- Status: Accepted for observation; enforcement requires production verification
- Date: 2026-10-21

## Context

MathBoard deploys the Vite `dist/` directory as Cloudflare Workers Static
Assets (`wrangler.json`). The web runtime loads Simple Analytics only on
`mathboard.app` and only in production. Historically it requested the mutable
`https://scripts.simpleanalyticscdn.com/latest.js`, which cannot safely use a
fixed Subresource Integrity (SRI) digest.

The existing desktop shell already has its own restrictive Content Security
Policy in `src-tauri/tauri.conf.json`. No desktop CSP change is needed here.

Cloudflare Workers Static Assets now supports `_headers` in the static assets
directory, including Vite `public/_headers` copied into `dist/`. A separate
middleware Worker or dashboard-only rule is not necessary for static responses.
Headers in `_headers` do **not** affect Worker-generated responses should
this application introduce them later.

## Decision

1. Use Simple Analytics' documented pinned
   `https://scripts.simpleanalyticscdn.com/sri/v11.js` and its published
   SHA-384 SRI hash, with `crossorigin="anonymous"`, in the existing
   `src/analytics/index.js` loader. Keep the production hostname gate,
   queued events, and privacy policy unchanged.
2. Publish `Content-Security-Policy-Report-Only` via `public/_headers`.
   Report-only is deliberately not enforcement: it gathers browser console
   evidence without accidentally blocking math rendering, analytics, or
   public static pages.
3. The candidate policy starts from
   `default-src 'self'`, allows only Simple Analytics' documented script and
   queue origins, disallows objects and external framing, and restricts base
   URLs. Inlined styles remain allowed because Fabric and existing components
   use dynamic/inline styles. `data:` and `blob:` are allowed for images,
   and `data:` for fonts pending browser verification. Same-origin workers
   are reserved for a future separately reviewed PWA.
4. Add `X-Content-Type-Options: nosniff` and
   `Referrer-Policy: strict-origin-when-cross-origin` to static responses.
5. **Do not promote report-only CSP to an enforcing header** until
   violations and real requests are observed on the deployed web app. Do not
   assume `vite preview` applies Cloudflare's `_headers` rules.

## Verification and rollout

Before enforcement, record the following on a staging Worker or on production
with report-only headers:

- Inspect actual HTTP response headers on `/` and on at least one SEO page.
  Verify `_headers` was copied to `dist/` and deployed by Wrangler.
- On `mathboard.app`, verify the SRI-pinned script loads without an integrity
  or CORS failure, queued `sa_event` calls flush, and pageviews/custom events
  appear in Simple Analytics. On preview domains and Tauri, verify no analytics
  script is requested.
- Inspect DevTools Console and Network with a cold cache. Exercise canvas
  drawing, themes, formula creation/edit (KaTeX preview plus lazy MathJax SVG),
  imported/embedded resources, share-stamp flows, SEO pages, and offline/PWA
  behavior if that feature exists at the time of testing.
- Capture any report-only violations, including scripts injected by extensions,
  and distinguish app violations from extension noise.
- Only after this matrix is clear, change to `Content-Security-Policy` in a
  separate PR. Use the smallest observed set of allowed sources; remove
  exceptions if not actually necessary. Recheck the deployed response and
  analytics afterward.

There is no `report-uri`/`report-to` endpoint configured, so the current
policy emits browser observations rather than server-side violation reports.

## Consequences and alternatives

The pinned SRI release will not silently receive vendor script changes. Update
the URL and hash together when upgrading to the next published SRI version;
regularly review vendor security announcements and analytics behavior.

The decision avoids shipping an untested enforced CSP. Report-only does not
prevent exploitation on its own; the hardening benefit is incomplete until
enforcement is verified and deployed.

We explicitly avoid a new Worker middleware, a `latest.js` hash, and a
blanket removal of inline styles in this phase. The desktop policy is a
separate security boundary and remains unchanged.

## References

- [Cloudflare Workers Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Simple Analytics SRI release](https://docs.simpleanalytics.com/sri)
- [Simple Analytics events](https://docs.simpleanalytics.com/events)
- `src/analytics/index.js`, `src-tauri/tauri.conf.json`,
  `wrangler.json`, `public/_headers`
- Related tracking issue: [CRIT-5 #78](https://github.com/giacomobartoloni/mathboard/issues/78)
