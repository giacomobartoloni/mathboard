/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { renderOpenBoardCTA, renderScreenshot } from '../lib/render-components.mjs'
import {
  renderChecksumsLink,
  renderDownloadLink,
  renderReleaseContext,
  renderSecurityNotice,
  renderVerifiedNote,
} from '../lib/desktop-downloads.mjs'

export default {
  lastmod: '2026-10-22',
  path: '/download/',
  title: 'Download MathBoard Desktop for Mac, Windows and Linux',
  description:
    'Download the free, open-source MathBoard desktop beta for macOS, Windows or Linux. Official GitHub installers, platform-specific guides and security details.',
  h1: 'MathBoard for desktop',
  structuredData: 'webpage',
  aboutSoftware: true,
  breadcrumbs: [
    { label: 'MathBoard', href: '/' },
    { label: 'Desktop downloads' },
  ],
  body: `
    <p class="lede">Draw diagrams, add text, and work with editable LaTeX formulas in
      MathBoard on your computer. Choose your operating system below.
      Desktop is currently a public beta; the browser app remains available without installation.</p>
    ${renderReleaseContext()}
    <div class="download-grid">
      <section class="download-card" aria-labelledby="macos-download">
        <p class="download-platform">macOS</p>
        <h2 id="macos-download">MathBoard for Mac</h2>
        <p>Choose the disk image that matches your Mac's chip.</p>
        <p class="download-actions">
          ${renderDownloadLink('macosArm64', 'Apple Silicon (DMG)', 'hub-macos')}
          ${renderDownloadLink('macosIntel', 'Intel (DMG)', 'hub-macos', { primary: false })}
        </p>
        <p class="download-status-note">${renderVerifiedNote('macos-arm64')} — Apple Silicon only.</p>
        <a href="/download/macos/">Mac installation guide →</a>
      </section>
      <section class="download-card" aria-labelledby="windows-download">
        <p class="download-platform">Windows</p>
        <h2 id="windows-download">MathBoard for Windows</h2>
        <p>64-bit Windows installers. Use the EXE setup or choose MSI for managed installation.</p>
        <p class="download-actions">
          ${renderDownloadLink('windowsExe', 'Windows setup (EXE)', 'hub-windows')}
          ${renderDownloadLink('windowsMsi', 'Windows installer (MSI)', 'hub-windows', { primary: false })}
        </p>
        <p class="download-status-note">${renderVerifiedNote('windows-x64')}</p>
        <a href="/download/windows/">Windows installation guide →</a>
      </section>
      <section class="download-card" aria-labelledby="linux-download">
        <p class="download-platform">Linux</p>
        <h2 id="linux-download">MathBoard for Linux</h2>
        <p>64-bit Linux builds. AppImage is a portable option; DEB is for Debian-based distributions.</p>
        <p class="download-actions">
          ${renderDownloadLink('linuxAppImage', 'Linux AppImage', 'hub-linux')}
          ${renderDownloadLink('linuxDeb', 'Debian / Ubuntu (DEB)', 'hub-linux', { primary: false })}
        </p>
        <p class="download-status-note">${renderVerifiedNote('linux-x64')}</p>
        <a href="/download/linux/">Linux installation guide →</a>
      </section>
    </div>
    ${renderSecurityNotice()}
    ${renderScreenshot({
      src: '/og-image.png',
      alt: 'MathBoard canvas showing mathematical drawings and a rendered formula',
      caption: 'MathBoard combines drawing and mathematical notation in a single whiteboard.',
    })}
    <section>
      <h2>Use MathBoard online instead</h2>
      <p>The browser version opens immediately, without an account or an installer.
        It is a good alternative if an unsigned beta is blocked by your device or organization.</p>
      <p class="cta-row">${renderOpenBoardCTA({ placement: 'download-browser-alternative' })}</p>
    </section>
    <section>
      <h2>Official downloads and support</h2>
      <p>Installer files are served directly by the official GitHub repository, not mirrored on this website.
        Compare your file against ${renderChecksumsLink()} from the same release.
        A checksum checks integrity but does not establish the publisher's identity.</p>
      <p>There is no automatic desktop updater yet. See the
        <a href="/download/security/">security guide</a> and
        <a href="https://github.com/giacomobartoloni/mathboard/issues">report installation problems on GitHub</a>.</p>
    </section>
  `,
}

