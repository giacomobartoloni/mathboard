# SEO sidecar pages

Static HTML pages generated after `vite build` by `tools/build-seo.mjs`.

- Page definitions: `seo/pages/*.mjs` (hand-written copy, not generated)
- The first Italian page is `/it/lavagna-matematica/`, manually paired with `/math-whiteboard/` via reciprocal `hreflang` (`en`, `it`, `x-default`). Do not emit hreflang for pages without translations.
- Shared layout/components: `seo/lib/`
- Assets copied by Vite: `public/seo/seo.css`, `public/seo/seo.js`
- KaTeX CSS/fonts are copied into `dist/seo/katex/` at SEO build time

`/` remains the Vue app. Do not add marketing copy to the board shell for SEO.

Sitemap dates are **opt-in**: set `lastmod: 'YYYY-MM-DD'` on a page definition only after a significant content/structured-data change. Do not use build dates or add dates for untouched pages. The homepage deliberately has no `lastmod` until an authoritative update source is defined.
