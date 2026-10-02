# Desktop development

MathBoard's desktop application is a Tauri 2 host for the existing Vue and Vite
frontend. It uses the same source and production `dist/` output as the web application.

## Prerequisites

- Node.js 22 and npm
- The stable Rust toolchain installed with [rustup](https://rustup.rs/)
- Platform build tools:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Microsoft C++ Build Tools with the Desktop development with C++ workload,
    plus WebView2 where it is not already supplied by Windows
  - Ubuntu 22.04:

```sh
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

The `libwebkit2gtk-4.1-dev` package is required by Tauri 2; older Tauri 1 examples
using WebKitGTK 4.0 are not applicable.

## Run locally

```sh
npm ci
npm run desktop:info
npm run desktop:dev
```

`desktop:dev` starts Vite at `http://localhost:5173` through Tauri's configured
`beforeDevCommand`, then opens the native window. Browser-only development remains
available with `npm run dev`.

## Build

```sh
npm run lint
npm run build
npm run desktop:build
```

Tauri invokes `npm run build` itself before compiling and bundling. Use the explicit
web build above when reproducing CI or checking the frontend independently. To compile
the native application without creating installers:

```sh
npm run desktop:build -- --no-bundle
```

## Troubleshooting

- Run `npm run desktop:info` first to inspect the detected Rust, Node, WebView, and
  platform dependencies.
- If Linux cannot find WebKitGTK, confirm that the installed development package is
  `libwebkit2gtk-4.1-dev` and that `pkg-config` can resolve it.
- If Windows compilation cannot find a linker, install the MSVC C++ workload and start
  a new terminal.
- If the desktop window cannot reach Vite, check that port 5173 is free and that no
  stale Vite process is still running.
- If an external link does not open, it must match the capability allowlist:
  `https://*` or `mailto:*`.
- On the web, Privacy Policy uses same-origin `/privacy-policy.html`. In the desktop
  app it opens `https://mathboard.app/privacy-policy.html` in the system browser
  through the scoped opener, so that link requires network access.
- If CSP blocks a new resource, update the narrow directives in
  `src-tauri/tauri.conf.json`; do not disable the CSP.

Board contents and undo/redo history exist only for the current session. Reloading or
closing the app discards them because document persistence is not implemented. UI
preferences such as the selected theme may persist independently through
`localStorage`.
