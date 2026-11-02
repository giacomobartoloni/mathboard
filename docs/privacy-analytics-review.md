# Privacy notice and cookieless analytics — release review

Date: 2026-10-28  
Related: [ADR 0002](adr/0002-product-analytics.md), [ADR 0010](adr/0010-desktop-event-analytics.md)

## Implementation scope

- Removed the application's cookie banner because its Accept All, Essential Only and Reject All buttons saved consent preferences but did not control any analytics loading.
- Removed the banner component and all application imports/references. New versions do not write a consent flag; existing legacy browser storage is intentionally left untouched.
- The standard Simple Analytics web script and its metric collection are unchanged. Pageviews and categorical product events remain active on the canonical production website. No new opt-out metric configuration is included in this PR.
- The static Privacy Policy page retains its separate canonical-host-gated Simple Analytics bootstrap.
- The native desktop analytics transport and event taxonomy are unchanged.
- The notice now describes local board storage, website requests served through Cloudflare, production web and desktop analytics, incidental technical connection data, purposes/legal bases, retention caveats and GDPR rights.

## Legal assessment still required

Removing a non-functional consent banner does **not** itself demonstrate that analytics is exempt from ePrivacy consent.

- Check the [Italian Garante's cookie FAQ](https://www.garanteprivacy.it/faq/Cookie) and [2021 guidelines](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876) for when third-party analytics can qualify as statistical/technical-like.
- Consider [EDPB Guidelines 2/2023 on Article 5(3) ePrivacy, final 2024](https://www.edpb.europa.eu/documents/guideline/guidelines-22023-on-technical-scope-of-art-53-of-eprivacy-directive_en): reading terminal-device data can be within scope even without cookies.
- Confirm the actual Simple Analytics account's provider terms, whether datasets are combined for other clients' purposes, subprocessors and applicable data-retention policy.
- Confirm Cloudflare's actual deployment-specific technical logging, retention and transfer arrangements. The Privacy Policy deliberately avoids inventing fixed retention durations.
- Have the project owner/legal reviewer confirm controller identification, legitimate-interest assessments and publication language before deploying the notice.

## Verification checklist

1. Run `npm run lint`, `npm run test:unit`, `npm run build` and `npm run test:e2e` on the PR head.
2. Open `mathboard.app` in a fresh browser profile: no banner; no new `mathboard_cookie_consent` value; existing boards, preferences and save/open remain functional.
3. Inspect page and `/privacy-policy.html` Network requests: script still loads only on `mathboard.app`, and standard analytics events/pageviews are unchanged; payloads carry no user-entered text, LaTeX or persistent identity.
4. Verify the Do Not Track behavior and that previews/development hosts do not send web analytics.
5. Verify desktop build remains banner-free and retains semantic-event delivery without pageviews. Existing native distribution gates continue to apply.
6. Update the privacy notice's "Last updated" date if publication occurs after 2026-10-28.

The release should be paused if the actual implementation does not meet the appropriate consent exemption. A separate change would be needed to introduce meaningful consent controls for non-exempt measurements.
