# SEO sidecar pages

Static HTML pages generated after `vite build` by `tools/build-seo.mjs`.

- Page definitions: `seo/pages/*.mjs` (hand-written copy, not generated)
- Shared layout/components: `seo/lib/`
- Assets copied by Vite: `public/seo/seo.css`, `public/seo/seo.js`
- KaTeX CSS/fonts are copied into `dist/seo/katex/` at SEO build time

`/` remains the Vue app. Do not add marketing copy to the board shell for SEO.
