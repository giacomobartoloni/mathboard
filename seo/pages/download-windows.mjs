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
  path: '/download/windows/',
  title: 'Download MathBoard for Windows — EXE and MSI',
  description:
    'Get MathBoard for 64-bit Windows as an EXE or MSI installer. Read the installation steps and unsigned beta security limitations.',
  h1: 'Download MathBoard for Windows',
  structuredData: 'webpage',
  aboutSoftware: true,
  breadcrumbs: [
    { label: 'MathBoard', href: '/' },
    { label: 'Downloads', href: '/download/' },
    { label: 'Windows' },
  ],
  body: `
    <p class="lede">Download the free MathBoard desktop beta for 64-bit Windows
      to draw mathematical diagrams, write text and edit LaTeX formulas.</p>
    ${renderReleaseContext()}
    <div class="download-options">
      <div class="download-option">
        <h2>Standard setup (EXE)</h2>
        <p>Choose this installer for a typical personal Windows installation.</p>
        <p class="cta-row">${renderDownloadLink('windowsExe', 'Download Windows setup (EXE)', 'windows-guide')}</p>
      </div>
      <div class="download-option">
        <h2>Windows Installer (MSI)</h2>
        <p>An alternative package format for environments that use MSI installers.</p>
        <p class="cta-row">${renderDownloadLink('windowsMsi', 'Download Windows MSI', 'windows-guide', { primary: false })}</p>
      </div>
    </div>
    <p class="download-status-note">${renderVerifiedNote('windows-x64')}</p>
    <section>
      <h2>Install on Windows</h2>
      <ol>
        <li>Download the official EXE or MSI and verify its SHA-256 checksum
          against ${renderChecksumsLink()}. In PowerShell use
          <code>Get-FileHash .\MathBoard_1.8.0_x64-setup.exe -Algorithm SHA256</code>
          (or the exact name of your MSI).</li>
        <li>Run the verified installer using your normal Windows installation process.</li>
        <li>These installers are not Authenticode-signed. Defender SmartScreen,
          Smart App Control or organization policies may warn or prevent installation.</li>
      </ol>
      <p>Do not disable Windows security features or bypass organization policies.
        If your device blocks the installer, <a href="/">use MathBoard in the browser</a>
        or wait for a signed release.</p>
    </section>
    ${renderSecurityNotice()}
    <section>
      <h2>Alternative: browser version</h2>
      <p>No installation is required to start drawing with MathBoard online.</p>
      <p class="cta-row">${renderOpenBoardCTA({ placement: 'windows-browser-alternative' })}
        <a class="button" href="/download/">All desktop downloads</a></p>
    </section>
  `,
}

