# Contributing

Setup, scripts, and icon generation are in the [README](README.md).

## Changes

Open an issue before a change that alters behavior or the public interface. Small fixes can go straight to a pull request.

1. Fork the repository and create a branch from `main`.
2. Install dependencies with `npm ci`. For E2E locally, also run `npm run test:e2e:install` once.
3. Run `npm run dev` while you work.
4. Before opening the pull request, run:

```sh
npm run lint
npm run test:unit
npm run build
npm run assert:no-e2e-hook
npm run test:e2e
```

`npm run lint` reports problems and leaves files unchanged. `test:unit` runs the Node module tests; `test:e2e` builds into `dist-e2e/` and runs the Playwright Chromium P0 suite. `assert:no-e2e-hook` fails if the production `dist/` still contains the E2E observability marker.

Regenerate the PWA icons with `npm run generate:icons` only when `tools/icon-template.html` changes. The script needs network access and stops if the Satisfy font does not load.

## Code

Match the existing sources:

- Vue 3 components use the Options API with a `setup()` function. Component files are PascalCase.
- JavaScript only. Dependencies come from `package-lock.json` through npm.
- New and modified source files keep the AGPL header already present in `src/main.js`. Keep the copyright line `Copyright (C) 2026 Giacomo Bartoloni`.

## License

MathBoard is licensed under the GNU Affero General Public License v3.0. Contributions are licensed under the same terms. See [LICENSE.md](LICENSE.md).
