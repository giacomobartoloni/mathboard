# Cloudflare Board Share — deployment and verification

This runbook covers the optional encrypted Board Share feature. It does not enable cloud backup, synchronization, or collaboration.

## Existing application topology

MathBoard is already deployed as a Cloudflare Worker with static assets. The existing `mathboard` Worker serves both the web app and the new `/api/shares` POST/GET endpoints; the API routes run before the static asset handler. No separate database, account service, or public bucket URL is needed.

The Worker receives opaque ciphertext only. The Workers Rate Limiting binding protects POST uploads, not GET reads, so multiple classroom recipients behind one IP are not blocked by the small upload quota. The browser generates a fresh AES-256-GCM key, compresses and encrypts a validated BoardDocument, and puts the key in the `#b=<opaque-id>,<key>` URL fragment. Anyone with the complete link can decrypt its contents. Link recipients receive independent editable local copies. Existing `#s=` selection Stamp links remain local URL transfers.

## Test sharing locally with Wrangler (without a Cloudflare account)

Running `npm run dev` starts **Vite only**. It does not serve the Worker `/api/shares` route, so pressing **Get shareable link** against `localhost:5173` cannot upload anything. Do not mistake this for a cryptography failure.

For a self-contained local smoke test, use the configured Worker and Miniflare's simulated private R2 storage:

```sh
npm ci
npm run build
npx wrangler dev --port 8787
```

Open **the address Wrangler prints** (typically `http://localhost:8787`), not the Vite dev port. Click **Share → Get shareable link**. Open the generated local link in another browser tab to verify the independent board import. The local link is **not externally shareable**: it points to your local Worker. Local R2 data is isolated from production and is persisted by Wrangler under `.wrangler/state`. These commands have not been run as part of the Cloudflare remote deployment checks.

For actual internet-accessible links, configure the Cloudflare resources and deploy the Worker as described below. Never point a development Worker at the production R2 bucket just to make local testing work. See https://developers.cloudflare.com/r2/local-development/ for the local R2 behavior.

## Privacy-safe operational diagnostics

User-facing Share errors must never expose Cloudflare, Workers, R2, API
details or server configuration. The separate product analytics funnel records
only semantic events and an allowlisted failure stage, not infrastructure
reasons.

Cloudflare Workers Logs persist invocation outcomes and sanitized application
diagnostics. The Worker logs only fixed `board_share_failure` reason codes:
`missing_bindings`, `storage_write_failed`,
`storage_read_failed` and `unexpected_error`.
It never logs document content, share IDs, keys, full URLs, IP addresses,
request headers or exception messages. Cloudflare's platform invocation logs
may contain standard request metadata; query strings are configured to be
redacted. Inspect log retention and account privacy settings.

The `observability.logs` section in `wrangler.json` enables persistence and
invocation logs with 100% sampling during initial verification. After deploy,
open **Cloudflare dashboard → Workers & Pages → mathboard → Observability →
Logs**, or stream deployed Worker events using:

```sh
npx wrangler tail mathboard --format pretty
```

Look for `board_share_failure`. For example:

```json
{"event":"board_share_failure","operation":"request","reason":"missing_bindings"}
```

The bucket and lifecycle rule have been created by the maintainer, but
the deployed Worker must still expose `/api/shares` and have its
`BOARD_SHARES` and `SHARE_RATE_LIMITER` bindings. Changes to the
configuration require a deploy. Vite-only local development does not
execute the Worker and produces no Cloudflare log events.
Review sampling later based on log volume and account cost.

## Preview branch: isolated bindings

The feature branch uses **Cloudflare Worker Previews**. These previews do not
inherit production bindings. Previously, `previews: {}` caused
`board_share_failure: missing_bindings` and HTTP 503 even after the production
R2 bucket had been created.

Production remains bound to `mathboard-board-shares` and rate-limit namespace
`24016`. Preview uses a **different private bucket**
`mathboard-board-shares-preview` and rate-limit namespace `24017`, both
explicitly configured under `previews` in `wrangler.json`.

Create the preview bucket **once** in the same Cloudflare account and add the
same 90-day lifecycle rule for objects under `boards/`:

```sh
npx wrangler r2 bucket create mathboard-board-shares-preview
npx wrangler r2 bucket lifecycle add mathboard-board-shares-preview expire-shares-90d boards/ --expire-days 90
npx wrangler r2 bucket lifecycle list mathboard-board-shares-preview
```

Do not recreate the existing production bucket. Do not expose either bucket
through a public R2 URL. If the preview bucket exists already, skip the
create command; apply/verify the lifecycle instead.

After committing the preview configuration, re-run the Cloudflare preview
deployment (normally performed by connected Workers Builds on a branch push;
otherwise `npx wrangler preview`). Verify both bindings are present under the
Preview deployment settings, then retry sharing. A successful POST returns
201, while the Share panel shows a link hosted on the preview origin.

The private preview bucket can be shared by different feature previews, so
it is isolated from production **but not from other preview branches**. This is
sufficient for development testing. Test data should not be considered
permanent and preview share links should not be distributed as permanent URLs.

References:
- https://developers.cloudflare.com/workers/previews/configuration/
- https://developers.cloudflare.com/workers/previews/resources/

## Cloudflare account setup — required before deployment

1. Create a **private R2 bucket** named `mathboard-board-shares`. For example, in the target account run `npx wrangler r2 bucket create mathboard-board-shares` or create the bucket in the dashboard.
2. Configure an R2 **object lifecycle rule** for keys with prefix `boards/` that deletes objects after **90 days**. R2 cleanup is asynchronous; the Worker checks each object's stored `expiresAt` timestamp and refuses GETs immediately at expiry.
3. Bind the bucket as `BOARD_SHARES`. Confirm the name and binding in `wrangler.json`. Cloudflare Workers Rate Limiting is bound as `SHARE_RATE_LIMITER`; the initial limit is 30 requests per IP per minute. Review namespace configuration and account-specific quotas.
4. Configure Cloudflare WAF/bot abuse monitoring for `POST /api/shares` and review cost alerts/budgets, particularly because this is an unauthenticated upload endpoint. Rate limiting is one defense, not a replacement for abuse controls. Restrict Worker access to private bucket objects; do not enable a public R2 endpoint.
5. Review the updated Privacy Policy, data processing location, Cloudflare request/security logs, provider terms and GDPR implications before turning on uploads.

Until the bucket and binding exist, the Worker responds `503 unavailable`. Do not claim end-to-end sharing works merely because a production web build or static-asset CI passed. Coordinate Cloudflare preview deployments separately; a preview Worker must not silently write to the production bucket.

## Network contract

- `POST /api/shares`: requires an allowed `Origin` and `application/octet-stream`; uploads at most 2 MiB of ciphertext and returns a random ID and ISO expiry.
- `GET /api/shares/:id`: returns ciphertext only, or 400/404/410 on invalid, missing, or expired links. Responses use `Cache-Control: no-store`.
- The Worker stores only ciphertext and expiration metadata in R2; keys stay in the URL fragment and browser. Browser-generated links use their current environment origin (e.g. staging previews stay on staging), while desktop links use the public MathBoard origin. Application analytics never receives board content, IDs, keys, payloads, or free-form error text.

## Pre-release checklist

- Run `npm ci && npm run lint && npm run test:unit && npm run build`.
- Run `npx wrangler deploy --dry-run` using the intended Cloudflare environment, once the required bindings are present.
- Verify static app, privacy page and normal board operations still load.
- In staging, check that opening Share produces **zero** upload requests; only **Get shareable link** uploads. Test success, clipboard copy, error/retry, anonymous browser opening, and an independent editable local copy, including a board containing plots, formulas, ordinary objects and existing groups.
- Verify a link remains accessible before expiry and returns 410 exactly at/after the stored timestamp. Confirm R2 lifecycle cleanup of expired ciphertext (may occur asynchronously).
- Verify the share key is absent from Worker requests, logs, analytics metadata and recorded page URLs. Existing `#s=` Stamp selection sharing must remain unchanged.
- Test Library Export on active, inactive and archived boards. Do not treat file import as shipped until separately implemented.
- Review Cloudflare costs, rate limits, abuse controls and data privacy settings before production activation.

## Scope boundaries

No authentication, user quotas, link revocation UI, password prompts, server-side decryption, document synchronization, live collaboration, public discovery, or new scheduled cleanup service. The source of truth remains the local BoardDocument.
