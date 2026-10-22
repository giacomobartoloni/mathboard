/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { renderOpenBoardCTA } from '../lib/render-components.mjs'
import {
  renderChecksumsLink, renderReleaseContext, renderSecurityNotice,
} from '../lib/desktop-downloads.mjs'

export default {
  lastmod: '2026-10-22',
  path: '/download/security/',
  title: 'MathBoard Desktop Beta — Security and SHA-256 Verification',
  description:
    'Important limitations of unsigned MathBoard installers for macOS, Windows and Linux, and how to verify downloaded files with SHA-256 checksums.',
  h1: 'Desktop beta: installation and security',
  structuredData: 'webpage',
  aboutSoftware: true,
  breadcrumbs: [
    { label: 'MathBoard', href: '/' },
    { label: 'Downloads', href: '/download/' },
    { label: 'Security' },
  ],
  body: `
    <p class="lede">MathBoard Desktop is free and open source, but the initial public beta is
      distributed without verified publisher code-signing certificates. Decide whether
      that is appropriate for your device before installing.</p>
    ${renderReleaseContext()}
    ${renderSecurityNotice()}
    <section>
      <h2>Check the file you downloaded</h2>
      <ol>
        <li>Use the <a href="/download/">platform download links</a> on this site. They point
          to the official GitHub repository, not a third-party mirror.</li>
        <li>Download ${renderChecksumsLink()} from the same GitHub release.</li>
        <li>Compute SHA-256 for your downloaded file and compare it with the matching
          filename in the checksum document.</li>
        <li>If the values differ, <strong>do not install or run the file</strong>.</li>
      </ol>
      <div class="table-wrap">
        <table>
          <thead><tr><th>System</th><th>Command</th></tr></thead>
          <tbody>
            <tr><td>macOS</td><td><code>shasum -a 256 filename.dmg</code></td></tr>
            <tr><td>Windows PowerShell</td><td><code>Get-FileHash .\\filename.exe -Algorithm SHA256</code></td></tr>
            <tr><td>Linux</td><td><code>sha256sum downloaded-file</code></td></tr>
          </tbody>
        </table>
      </div>
      <p>Matching hashes can detect changes or corruption. Because the checksum file
        and binary originate from the same unsigned release, a matching hash
        <strong>does not independently authenticate the publisher</strong>.</p>
    </section>
    <section>
      <h2>Operating-system protections</h2>
      <p><strong>macOS:</strong> the DMGs are not Developer ID-signed or notarized by Apple.
        Gatekeeper may block the app. See the <a href="/download/macos/">Mac installation guide</a>
        and <a href="https://support.apple.com/en-us/102445">Apple's official instructions</a>.</p>
      <p><strong>Windows:</strong> EXE and MSI installers are not Authenticode-signed;
        Defender SmartScreen, Smart App Control or company policies may prevent installation.
        See <a href="/download/windows/">Windows guidance</a>.</p>
      <p><strong>Linux:</strong> AppImage and DEB packages are not signed by a distribution
        repository identity. See the <a href="/download/linux/">Linux guide</a>.</p>
      <p>Do not turn off operating-system security globally, remove macOS quarantine
        attributes, bypass managed-device rules or rely on copies from unofficial sources.</p>
    </section>
    <section>
      <h2>Known desktop beta limitations</h2>
      <p>There is no built-in automatic updater. The current app uses local
        browser-style storage, and an active scratch board is not guaranteed to
        reopen after a new session. Back up important work and check new release notes.</p>
      <p>If a security tool blocks installation, the <a href="/">browser version</a>
        is available without downloading the beta.</p>
      <p class="cta-row">${renderOpenBoardCTA({ placement: 'security-browser-alternative' })}
        <a class="button" href="/download/">Choose a desktop installer</a></p>
      <p>Report installation warnings or bugs through
        <a href="https://github.com/giacomobartoloni/mathboard/issues">GitHub Issues</a>
        without including private board data.</p>
    </section>
  `,
}

