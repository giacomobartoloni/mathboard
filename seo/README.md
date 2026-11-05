# SEO sidecar pages

Static HTML pages generated after `vite build` by `tools/build-seo.mjs`.

- Page definitions: `seo/pages/*.mjs` (hand-written copy, not generated)
- Shared layout/components: `seo/lib/`
- Static site presentation: `public/seo/site.css` (shared CSS; not SEO metadata)
- Static page behavior: `public/seo/seo.js` (CTA analytics, download click intent, copy buttons)
- KaTeX CSS/fonts are copied into `dist/seo/katex/` at SEO build time
- Desktop download pages use a reviewed release snapshot in `seo/data/desktop-release.mjs`; see `docs/desktop/DOWNLOAD_PAGES.md`

`/` remains the Vue app. Do not add marketing copy to the board shell for SEO.

Sitemap dates are **opt-in**: set `lastmod: 'YYYY-MM-DD'` on a page definition only after a significant content/structured-data change. Do not use build dates or add dates for untouched pages. The homepage deliberately has no `lastmod` until an authoritative update source is defined.


## International math whiteboard landing pages

- English source: `/math-whiteboard/` (`seo/pages/math-whiteboard.mjs`).
- Localized pages and reciprocal language registry: `seo/pages/localized-math-whiteboards.mjs`.
- Every localized page has its own canonical URL, `<html lang>`, localized copy, visible language links, and reciprocal `hreflang` including `x-default`.
- `/ar/math-whiteboard/` and `/ur/math-whiteboard/` use `dir="rtl"`; keep equations isolated as left-to-right runs.
- The application itself and linked documentation remain in English. Localized landing pages must state this plainly.
- Update the registry, content, page metadata and locale regression tests together. All registered pages are included automatically in the existing generated sitemap.
- Do not publish new translations without native-speaker review for search terminology, accessibility, mobile layout and factual product claims; no fabricated search-volume claims.
- Run `npm run test:unit`, `npm run lint`, and `npm run build` plus manual HTML/hreflang and RTL checks before merging.
