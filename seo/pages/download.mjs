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
    <div class="download-page">
    <section class="download-hero" aria-label="MathBoard desktop beta">
      <div class="download-hero-copy">
        <p class="download-hero-lead">Draw diagrams, add notes, and work with editable LaTeX formulas on your computer.</p>
        <p class="lede">Choose your operating system below. Desktop is currently a public beta;
          the browser app remains available without installation.</p>
        ${renderReleaseContext()}
      </div>
      ${renderScreenshot({
        src: '/og-image.png',
        alt: 'MathBoard logo on graph paper with mathematical drawings and formulas',
        eager: true,
        caption: 'MathBoard combines drawing and mathematical notation in a single whiteboard.',
      })}
    </section>
    <h2 class="download-choice-title">Choose your operating system</h2>
    <p class="download-preflight"><strong>Unsigned public beta:</strong> installers are not code-signed
      and may be blocked by your device. <a href="/download/security/">Read the safety and verification guide</a>
      before downloading.</p>
    <div class="download-grid">
      <section class="download-card" aria-labelledby="macos-download">
        <p class="download-platform">macOS</p>
        <h3 id="macos-download">MathBoard for Mac</h3>
        <p>Choose the disk image that matches your Mac's chip.</p>
        <p class="download-status-note">Apple Silicon DMG: ${renderVerifiedNote('macos-arm64')}<br>
          Intel DMG: ${renderVerifiedNote('macos-intel')}</p>
        <p class="download-actions">
          ${renderDownloadLink('macosArm64', 'Apple Silicon (DMG)', 'hub-macos')}
          ${renderDownloadLink('macosIntel', 'Intel (DMG)', 'hub-macos', { primary: false })}
        </p>
        <a href="/download/macos/">Mac installation guide →</a>
      </section>
      <section class="download-card" aria-labelledby="windows-download">
        <p class="download-platform">Windows</p>
        <h3 id="windows-download">MathBoard for Windows</h3>
        <p>64-bit Windows installers. Use the EXE setup or choose MSI for managed installation.</p>
        <p class="download-status-note">${renderVerifiedNote('windows-x64')}</p>
        <p class="download-actions">
          ${renderDownloadLink('windowsExe', 'Windows setup (EXE)', 'hub-windows')}
          ${renderDownloadLink('windowsMsi', 'Windows installer (MSI)', 'hub-windows', { primary: false })}
        </p>
        <a href="/download/windows/">Windows installation guide →</a>
      </section>
      <section class="download-card" aria-labelledby="linux-download">
        <p class="download-platform">Linux</p>
        <h3 id="linux-download">MathBoard for Linux</h3>
        <p>64-bit Linux builds. AppImage is a portable option; DEB is for Debian-based distributions.</p>
        <p class="download-status-note">${renderVerifiedNote('linux-x64')}</p>
        <p class="download-actions">
          ${renderDownloadLink('linuxAppImage', 'Linux AppImage', 'hub-linux')}
          ${renderDownloadLink('linuxDeb', 'Debian / Ubuntu (DEB)', 'hub-linux', { primary: false })}
        </p>
        <a href="/download/linux/">Linux installation guide →</a>
      </section>
    </div>
    ${renderSecurityNotice()}
    <div class="download-followup">
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
    </div>
    </div>
  `,
}

