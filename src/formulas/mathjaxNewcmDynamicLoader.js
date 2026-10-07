/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Vite-backed same-origin loader for MathJax NewCM SVG dynamic font ranges.
 * Enumerates every range shipped in @mathjax/mathjax-newcm-font@4.1.3.
 * Import() arguments are static literals so Vite can emit hashed chunks.
 */

export const NEWCM_DYNAMIC_PREFIX = 'mathboard-newcm'

const NEWCM_DYNAMIC_LOADERS = Object.freeze({
  'PUA': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/PUA.js'
    ),
  'accents': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/accents.js'
    ),
  'accents-b-i': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/accents-b-i.js'
    ),
  'arabic': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/arabic.js'
    ),
  'arrows': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/arrows.js'
    ),
  'braille': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/braille.js'
    ),
  'braille-d': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/braille-d.js'
    ),
  'calligraphic': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/calligraphic.js'
    ),
  'cherokee': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/cherokee.js'
    ),
  'cyrillic': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic.js'
    ),
  'cyrillic-ss': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic-ss.js'
    ),
  'devanagari': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/devanagari.js'
    ),
  'double-struck': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/double-struck.js'
    ),
  'fraktur': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/fraktur.js'
    ),
  'greek': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/greek.js'
    ),
  'greek-ss': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/greek-ss.js'
    ),
  'hebrew': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/hebrew.js'
    ),
  'latin': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/latin.js'
    ),
  'latin-b': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-b.js'
    ),
  'latin-bi': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-bi.js'
    ),
  'latin-i': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-i.js'
    ),
  'marrows': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/marrows.js'
    ),
  'math': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/math.js'
    ),
  'monospace': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace.js'
    ),
  'monospace-ex': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-ex.js'
    ),
  'monospace-l': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-l.js'
    ),
  'mshapes': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/mshapes.js'
    ),
  'phonetics': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics.js'
    ),
  'phonetics-ss': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics-ss.js'
    ),
  'sans-serif': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif.js'
    ),
  'sans-serif-b': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-b.js'
    ),
  'sans-serif-bi': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-bi.js'
    ),
  'sans-serif-ex': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-ex.js'
    ),
  'sans-serif-i': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-i.js'
    ),
  'sans-serif-r': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-r.js'
    ),
  'script': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/script.js'
    ),
  'shapes': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/shapes.js'
    ),
  'symbols': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols.js'
    ),
  'symbols-b-i': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols-b-i.js'
    ),
  'variants': () =>
    import(
      '@mathjax/mathjax-newcm-font/js/svg/dynamic/variants.js'
    ),
})

let installed = false

export function installNewcmDynamicLoader(mathjax) {
  if (installed) return

  const previous = mathjax.asyncLoad

  mathjax.asyncLoad = async (request) => {
    const prefix = `${NEWCM_DYNAMIC_PREFIX}/`

    if (typeof request === 'string' && request.startsWith(prefix)) {
      const range = request.slice(prefix.length).replace(/\.js$/, '')
      const load = NEWCM_DYNAMIC_LOADERS[range]

      if (!load) {
        throw new Error(
          `Unsupported MathJax NewCM dynamic range: ${range}`,
        )
      }

      return load()
    }

    if (typeof previous === 'function') {
      return previous(request)
    }

    throw new Error(`No MathJax async loader for: ${request}`)
  }

  installed = true
}
