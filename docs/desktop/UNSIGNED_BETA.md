# MathBoard desktop — unsigned public beta

MathBoard is free, open-source software. The initial desktop GitHub releases
may be made available as **unsigned public betas** while the project raises
funds to cover verified code signing and Apple notarization.

**Security status:** the macOS app is not Developer ID-signed or Apple-notarized;
ad-hoc signing is not a verified publisher signature. Windows installers are
not Authenticode-signed. Linux packages do not carry a signed distribution
repository identity. Security tools and managed devices may block these files.
If you are uncomfortable with those limitations, use the web version at
https://mathboard.app/ or wait for signed builds.

## Download and verify

1. Download **only** from the official
   [MathBoard GitHub Releases](https://github.com/giacomobartoloni/mathboard/releases).
   Look for a release explicitly marked **Pre-release / Unsigned Public Beta**.
2. Choose the installer matching your OS and CPU. macOS Apple Silicon and Intel
   DMGs are separate; Windows x64 provides NSIS (EXE) and MSI; Linux x64 provides
   AppImage and DEB.
3. Download `SHA256SUMS.txt` **from the same release** and compare the recorded
   SHA-256 digest with your local download:

   - macOS: `shasum -a 256 MathBoard_*.dmg` (use the actual downloaded filename)
   - Windows PowerShell: `Get-FileHash .\MathBoard_Installer.exe -Algorithm SHA256`
     (substitute the actual downloaded installer filename)
   - Linux: `sha256sum MathBoard_*.AppImage` or `sha256sum MathBoard_*.deb`

   The digest must match the corresponding line in `SHA256SUMS.txt`.
   **Stop and report the problem if it does not match.**

   A hash published next to an unsigned binary helps detect unintended changes.
   It **does not independently prove who created the file** or substitute for a
   trustworthy code-signing identity.

## macOS

1. Open the correct DMG for your chip and drag MathBoard into Applications.
2. Launch MathBoard from Applications. Because this beta is not notarized,
   macOS Gatekeeper may prevent the first launch.
3. Only if you trust the official source, verified the file checksum, and
   accept the risks of unsigned software, follow
   [Apple's per-app instructions](https://support.apple.com/en-us/102445):
   after attempting to open the app, go to
   **System Settings > Privacy & Security > Open Anyway** if it is offered.
4. If macOS reports that the file contains malware, is damaged, or the system
   remains unable to open it, **stop** and report the message. Do not globally
   disable Gatekeeper, remove quarantine attributes, or weaken Mac security.

## Windows

1. Download the x64 NSIS installer (`.exe`) or MSI (`.msi`) from the official
   release and verify its checksum.
2. Windows Defender SmartScreen may warn that the publisher is unknown.
   Smart App Control and organizational policies may block an unsigned app
   without offering an exception. Do not disable these protections.
3. If installation is blocked, use the web version or wait for a signed build.
   Do not run third-party copies or attempt to override organizational policy.

## Linux

1. Download the x64 AppImage or DEB from the official release and verify it.
2. For AppImage, make the verified file executable, for example:
   `chmod +x MathBoard_*.AppImage`, then run the AppImage.
3. For DEB, use your distribution's normal package-installation tools and
   inspect any dependency messages. The package is not signed by a Linux
   repository signing key.

## Limitations and feedback

This is beta software. The app reuses local browser-style storage, including
IndexedDB for board data; an active scratch board is **not guaranteed** to
reopen automatically after a completely new session. Save and reopen workflows
must be tested for each platform. There is no automatic updater.

Please report installation warnings, reproducible bugs, OS version and CPU
architecture in [GitHub Issues](https://github.com/giacomobartoloni/mathboard/issues).
Do not post personal documents, private board contents or secrets in issues.

## Support future signed releases

[Buy Me a Coffee](https://www.buymeacoffee.com/gbartoloni) — donations are
**entirely optional** and help finance Apple Developer membership,
notarization and Windows code-signing for future releases. The software is
free regardless of donations. Donating is not required for downloading,
using or reporting issues with MathBoard.
