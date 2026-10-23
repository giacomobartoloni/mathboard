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
