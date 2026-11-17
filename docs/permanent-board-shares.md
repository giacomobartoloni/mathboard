# Maintainer-only permanent Board Share links

Ordinary Share Board links remain **90-day encrypted snapshots**. A maintainer can deliberately preserve an *existing* educational share link beyond that limit, without changing its ID, decryption key, or recipient-copy behavior.

## Storage and Worker contract

| Kind | Private R2 key | Creation | Retrieval | Retention |
| --- | --- | --- | --- | --- |
| Ordinary share | `boards/<id>` | Existing public `POST /api/shares` only | Existing `GET /api/shares/<id>` with `expiresAt` check | 90 days + R2 prefix lifecycle cleanup |
| Selected permanent share | `permanent/<same-id>` | **Maintainer via authenticated R2 access only** | Same public GET, as fallback if ordinary object is missing or expired | No automatic expiry **provided no bucket lifecycle rule covers `permanent/`** |

The Worker **always attempts `boards/<id>` first**. If the ordinary share exists and is still valid, it serves that share with **one R2 GET** as before. Only when it is missing or expired does the Worker try `permanent/<id>`. A permanent object is selected by its **private storage prefix**, independent of a copied `expiresAt` metadata field. Without a permanent object, ordinary 410/404 behavior is unchanged.

No public upload/promote endpoint, account, admin credential in the app, metadata DB, board discovery, synchronization, or new link format is introduced. The existing URL's `#b=<id>,<key>` fragment remains the decryption key in the recipient's browser. R2 stores ciphertext only. The recipient still receives an **independent editable local copy**, never a live document.

This is **durable retention**, not a guarantee of everlasting service. The maintainer can revoke a permanent share by removing the permanent object, and Cloudflare account, bucket, routing and app-format availability still matter. Anyone possessing the **complete link** can access that copy until it is revoked; there is no password or identity gate.

## One-time deployment review (required; not performed by this PR)

1. Verify `BOARD_SHARES` in the *intended* deployed Worker points to the correct **private** R2 bucket. Production: `mathboard-board-shares`; previews: `mathboard-board-shares-preview`. Never use preview credentials to operate on production.
2. Inspect current **all** lifecycle rules in the target bucket. The 90-day deletion rule must match **`boards/` only**; **no all-objects or `permanent/` expiry rule** may match durable keys. Do not remove or weaken the `boards/` rule.
3. Deploy the updated Worker and run the usual lint/unit/build and share E2E before any promotion. Existing 90-day UI text remains truthful for newly created ordinary links; promoted teaching links are a deliberate exception.
4. Keep the bucket inaccessible via public R2 domains and apply existing Cloudflare cost, access and privacy monitoring. Do not claim that a Git merge has deployed a Worker or configured R2.

Current commands for inspecting bucket rules:

```sh
npx wrangler r2 bucket lifecycle list mathboard-board-shares
npx wrangler r2 bucket lifecycle list mathboard-board-shares-preview
```

See [Cloudflare R2 object lifecycle documentation](https://developers.cloudflare.com/r2/buckets/object-lifecycles/). The lifecycle configuration is **not** changed by this PR.

## One-share promotion runbook (manual, with explicit operator review)

**Prerequisites:** deploy completed; maintainer access to the correct bucket; an **existing authorized and still-valid 90-day share** selected for a durable public educational resource. Inspect the original link's validity and owner permission without pasting its full URL/fragment into terminals, GitHub issues, logs, PRs or analytics. Confirm that the selected R2 **ID** is exactly 22 base64url characters. **Never handle or log the link's 43-character decryption key in these commands.**

**Before writing:** inspect the destination `permanent/<id>` in the private R2 dashboard; **stop if it already exists**. Check the real bucket's lifecycle configuration and ensure no rule applies to `permanent/`. Confirm original object `boards/<id>` exists and its `expiresAt` is still in the future; do **not** promote a share that was already expired or deleted. These checks cannot be bypassed just because its ciphertext still remains in R2.

Use a temporary directory **outside this repository**, with restricted filesystem permissions:

```sh
set -eu
umask 077
BUCKET=mathboard-board-shares    # explicitly change to mathboard-board-shares-preview for a preview
SHARE_ID='<22-character-id-only>'
# Check the ID and the actual R2 bucket/destination manually before proceeding.
workdir=$(mktemp -d)
# Remove the temporary encrypted material after verification, not before.
npx wrangler r2 object get "$BUCKET/boards/$SHARE_ID" --remote --file "$workdir/source.bin"
npx wrangler r2 object put "$BUCKET/permanent/$SHARE_ID" --remote --file "$workdir/source.bin" --content-type application/octet-stream
npx wrangler r2 object get "$BUCKET/permanent/$SHARE_ID" --remote --file "$workdir/permanent.bin"
cmp "$workdir/source.bin" "$workdir/permanent.bin"
# Only after cmp succeeds and the public Worker returns 200 for the same ID:
rm -f "$workdir/source.bin" "$workdir/permanent.bin"
rmdir "$workdir"
```

**Operator safety:** replace `SHARE_ID` with an ID only, not a complete link. Do **not** execute the snippet blindly: the bucket choice, remaining temporary validity, destination absence, durable lifecycle scope and content authorization require manual confirmation first. Wrangler `object` commands require explicit `--remote` with modern Wrangler to access the Cloudflare account rather than local R2. If a network failure or interrupted command occurs, **stop**, inspect destination manually and resume from a known state. Never overwrite an existing durable key just because a CLI read failed. Temporary ciphertext files should be removed using ordinary data-handling hygiene; do not place them in Git or general screenshots.

**Postcondition:** the ciphertext is byte-identical and the URL ID is unchanged. Confirm a GET of `/api/shares/<id>` on the intended deployed environment returns **200** without exposing the fragment key. Test the same complete link in a **private second browser session** to confirm it still decrypts and imports an editable copy. The regression test covers expired and lifecycle-deleted ordinary object cases without waiting 90 days; a live expiry/retrieval integration test is separate.

**Do not delete `boards/<id>` manually.** Its existing lifecycle policy cleans up the temporary copy and prevents interruptions during the transition. The permanent object deliberately survives past that point.

### Revocation, failure and cost

- To revoke an already promoted link, deliberately delete `permanent/<id>` through authenticated R2 administration **after verifying the ID and business authorization**. While the ordinary object is still valid, its original 90-day link would remain accessible; to revoke immediately, both storage locations would need to be handled deliberately. This runbook **does not execute deletes**.
- If permanent R2 lookup fails, the Worker responds 503 (with an allowlisted log reason), not a stale expired copy or a plaintext explanation. If no permanent copy exists, expired originals still return 410 until lifecycle cleanup, then 404.
- R2 storage for selected permanent copies persists and can incur ongoing charges. Review intended audience, privacy, retained encrypted material and ongoing Cloudflare service availability. Store a separate **non-secret administrative inventory** of promoted IDs and purpose in an appropriately restricted place; do not include full URLs or decryption fragments.
- Source review and unit tests do not establish actual production bucket rules, deployment, recipient access, long-term retention, rights, or operational success.

## Release verification

Run `npm run lint`, `npm run test:unit`, `npm run build`, and staging share E2E using an isolated disposable board. Verify temporary behavior (200 before expiry; 410 once expired; 404 after removal), promoted behavior (200 after ordinary expiry **and** deletion; same ciphertext/ID/key), invalid IDs, R2 lookup failure 503, and no public promotion endpoint. Check logs for no IDs, keys or plaintext, and confirm both production and preview lifecycle rules separately.

This is a maintenance procedure, **not** a new public MathBoard product promise. The current Share panel still describes the default 90-day links accurately.
