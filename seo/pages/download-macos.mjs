/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { renderOpenBoardCTA } from '../lib/render-components.mjs'
import {
  renderChecksumsLink, renderDownloadLink, renderReleaseContext,
  renderSecurityNotice, renderVerifiedNote,
} from '../lib/desktop-downloads.mjs'

export default {
  lastmod: '2026-10-22',
  path: '/download/macos/',
  title: 'Download MathBoard for Mac — Apple Silicon and Intel',
  description:
    'Download MathBoard for macOS as a DMG for Apple Silicon or Intel, with instructions and important unsigned beta security warnings.',
  h1: 'Download MathBoard for macOS',
  structuredData: 'webpage',
  aboutSoftware: true,
  breadcrumbs: [
    { label: 'MathBoard', href: '/' },
    { label: 'Downloads', href: '/download/' },
    { label: 'macOS' },
  ],
  body: `
    <div class="reading-intro">
      <p class="lede">Get the free MathBoard desktop beta for your Mac.
        It combines freehand drawing, shapes and editable mathematical formulas.</p>
      ${renderReleaseContext()}
    </div>
    <div class="download-options">
      <div class="download-option">
        <h2>Mac with Apple Silicon (M1, M2, M3, M4 or newer)</h2>
        <p>${renderVerifiedNote('macos-arm64')}</p>
        <p class="cta-row">${renderDownloadLink('macosArm64', 'Download Apple Silicon DMG', 'macos-guide')}</p>
      </div>
      <div class="download-option">
        <h2>Mac with Intel processor</h2>
        <p>${renderVerifiedNote('macos-intel')}</p>
        <p class="cta-row">${renderDownloadLink('macosIntel', 'Download Intel DMG', 'macos-guide')}</p>
      </div>
    </div>
    <section>
      <h2>Which Mac do I have?</h2>
      <p>From the Apple menu, open <strong>About This Mac</strong>. Look for “Chip”
        (Apple M-series) or “Processor” (Intel), then choose the matching DMG above.</p>
    </section>
    <section>
      <h2>Install on macOS</h2>
      <ol>
        <li>Download the matching official DMG and verify it against ${renderChecksumsLink()}.
          In Terminal, run <code>shasum -a 256 filename.dmg</code> with the actual filename.</li>
        <li>Open the DMG and drag MathBoard to Applications.</li>
        <li>Launch it from Applications. Because this beta is not Apple Developer ID-signed
          or notarized, Gatekeeper may block the first launch.</li>
        <li>If you trust the source and accept the unsigned beta risks, consult
          <a href="https://support.apple.com/en-us/102445">Apple's per-app guidance</a>.
          Do not globally disable Gatekeeper or strip quarantine attributes.</li>
      </ol>
      <p>If macOS reports malware, a damaged app, or a block you cannot resolve safely,
        stop the installation and <a href="https://github.com/giacomobartoloni/mathboard/issues">report the issue</a>.</p>
    </section>
    ${renderSecurityNotice()}
    <section>
      <h2>Rather use the browser?</h2>
      <p>Run MathBoard online without installing a desktop beta.</p>
      <p class="cta-row">${renderOpenBoardCTA({ placement: 'macos-browser-alternative' })}
        <a class="button" href="/download/">All desktop downloads</a></p>
    </section>
  `,
}

