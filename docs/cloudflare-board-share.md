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
