/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { renderOpenBoardCTA } from '../lib/render-components.mjs'
import {
  assetName, renderChecksumsLink, renderDownloadLink, renderReleaseContext,
  renderSecurityNotice, renderVerifiedNote,
} from '../lib/desktop-downloads.mjs'

export default {
  lastmod: '2026-10-22',
  path: '/download/linux/',
  title: 'Download MathBoard for Linux — AppImage and DEB',
  description:
    'Download MathBoard for 64-bit Linux: portable AppImage and Debian or Ubuntu DEB packages, plus setup and SHA-256 verification instructions.',
  h1: 'Download MathBoard for Linux',
  structuredData: 'webpage',
  aboutSoftware: true,
  breadcrumbs: [
    { label: 'MathBoard', href: '/' },
    { label: 'Downloads', href: '/download/' },
    { label: 'Linux' },
  ],
  body: `
    <div class="reading-intro">
      <p class="lede">Use the free MathBoard whiteboard on 64-bit Linux.
        Draw diagrams and work with mathematical text and LaTeX notation in the desktop beta.</p>
      ${renderReleaseContext()}
    </div>
    <div class="download-options">
      <div class="download-option">
        <h2>AppImage (x86-64)</h2>
        <p>A portable format for supported Linux desktop environments. Your system must
          provide the required runtime libraries.</p>
        <p class="cta-row">${renderDownloadLink('linuxAppImage', 'Download Linux AppImage', 'linux-guide')}</p>
      </div>
      <div class="download-option">
        <h2>Debian / Ubuntu package (x86-64)</h2>
        <p>Choose the DEB package for compatible Debian-based distributions.</p>
        <p class="cta-row">${renderDownloadLink('linuxDeb', 'Download Linux DEB', 'linux-guide', { primary: false })}</p>
      </div>
    </div>
    <p class="download-status-note">${renderVerifiedNote('linux-x64')}</p>
    <section>
      <h2>Install on Linux</h2>
      <ol>
        <li>Download the appropriate package from GitHub and compare
          <code>sha256sum downloaded-file</code> against ${renderChecksumsLink()}.</li>
        <li>For AppImage, make the verified file executable with
          <code>chmod +x ${assetName('linuxAppImage')}</code>, then run the file.</li>
        <li>For DEB, install the verified package with your distribution's package manager;
          review any missing dependency warnings.</li>
      </ol>
      <p>These binaries are not signed by a Linux package repository identity.
        Verify the download before running it; report unsupported distributions
        or dependency failures in <a href="https://github.com/giacomobartoloni/mathboard/issues">GitHub Issues</a>.</p>
    </section>
    ${renderSecurityNotice()}
    <section>
      <h2>Use the web app without installing</h2>
      <p>The same MathBoard whiteboard is available in a modern browser.</p>
      <p class="cta-row">${renderOpenBoardCTA({ placement: 'linux-browser-alternative' })}
        <a class="button" href="/download/">All desktop downloads</a></p>
    </section>
  `,
}

