# Desktop test matrix

Run the relevant column on every release candidate. Web testing catches shared frontend
regressions; native testing catches WebView, window, CSP, opener, and packaging
differences.

| Area | Web | macOS | Windows | Linux |
| --- | --- | --- | --- | --- |
| Launch and layout | Load the production build; verify panels and canvas sizing | Launch `.app`; resize down to the 900×600 minimum | Launch installed app; resize down to the minimum | Launch packaged app; resize down to the minimum |
| Pencil | Draw short and long strokes; verify ink and zoom behavior | Repeat in WebKit | Repeat in WebView2 | Repeat in WebKitGTK 4.1 |
| Shapes | Draw, select, move, resize, and rotate rectangles, circles, and lines | Repeat | Repeat | Repeat |
| Text | Create text, edit it, move it, and finish editing by changing tools | Repeat; check font rendering | Repeat; check font rendering | Repeat; check font rendering |
| Formula | Insert and edit LaTeX; verify KaTeX preview and MathJax SVG board rendering | Repeat; inspect vector clarity | Repeat; inspect vector clarity | Repeat; inspect vector clarity |
| Selection | Multi-select objects, transform them, delete them, and restore them | Repeat | Repeat | Repeat |
| Pan and zoom | Pan, zoom from 0.1× to 5×, and switch tools while zoomed | Repeat with trackpad and mouse | Repeat with mouse and available touchpad | Repeat with mouse and available touchpad |
| History | Verify one undo entry per pencil, shape, text, formula, delete, and transform gesture; redo each action | Repeat | Repeat | Repeat |
| History boundary | Make a new edit after undo and confirm the redo tail is dropped; exercise the 50-entry cap | Repeat | Repeat | Repeat |
| Theme preference | Change the board theme, reload, and confirm it persists | Change the theme, close and reopen, and confirm it persists | Repeat | Repeat |
| Fullscreen | Enter and exit fullscreen where the browser supports it | Use both the in-app control and macOS View > Toggle Full Screen; ensure neither can enter fullscreen twice, both reflect the native state, and exit restores the regular layout | Verify the in-app control works or degrades safely in WebView2 | Verify the in-app control works or degrades safely in WebKitGTK |
| Native menu history | Keyboard undo/redo changes board history | macOS Edit > Undo / Redo changes board history by one step; Cmd+Z and Cmd+Shift+Z still work once; focused text inputs remain editable | Verify keyboard shortcuts | Verify keyboard shortcuts |
| External links | Verify HTTPS and `mailto:` links; Resources and Privacy Policy use same-origin pages | Verify GitHub, both Resources links (`https://mathboard.app/resources/`), and Privacy Policy (`https://mathboard.app/privacy-policy.html`) open in the system browser; verify `mailto:` invokes the configured mail handler | Repeat | Repeat |
| Stamp sharing | Select two objects and use Ctrl/Cmd+Shift+L; confirm the resulting link opens the Stamp in a browser | Confirm sharing uses `https://mathboard.app/#s=...`, never Tauri's internal origin; open the link in a browser and inspect both objects | Repeat | Repeat |
| Security smoke test | Check the production browser console for CSP errors | Check expected resources load under the Tauri CSP; verify the WebView makes no Simple Analytics script or ingestion request | Repeat | Repeat |
| Product analytics delivery | On `mathboard.app`, create one shape and verify `object_created` with `runtime=web` in Simple Analytics | In an installed production `.app`, create one shape and verify a new `object_created` with `runtime=desktop`, native `app_version`, and `object_type=shape` in Events Explorer/export | Repeat on an installed Windows package | Repeat on an installed Linux package |
| Analytics boundaries | Confirm a local preview sends no event | Confirm desktop development sends no event; check exposed WebView DNT `1`/`yes` suppresses events if supported, and record when it is not exposed; confirm offline editing works, no retry occurs, and no desktop pageview appears | Repeat and record WebView DNT support | Repeat and record WebView DNT support |
| Session lifecycle | Verify IndexedDB autosave/open across a reload and confirm undo history resets | Verify saved boards remain accessible after app restart; confirm history resets | Repeat | Repeat |

## Expected persistence behavior

MathBoard supports BoardDocument save/open and autosave using IndexedDB (ADR 0005).
The active board ID is scoped to sessionStorage; on a fresh session, the last scratch
board is not guaranteed to reopen automatically. Saved boards must remain accessible
through the existing open workflow. Undo/redo history is memory-only and resets on
open/restore. Verify IndexedDB and sessionStorage behavior in each native WebView.
UI preferences may persist independently through localStorage.

## Pre-distribution gate

Before shipping any installer, run every native row above against a bundled release
candidate on each target operating system, including CSP, formula insert/edit, HTTPS
and `mailto:` opener behavior, Privacy Policy, fullscreen, and an offline cold start.
Record the application version, OS version, package format, and native WebView version.
For analytics, record the event timestamp and an Events Explorer/export excerpt with
the approved metadata keys, plus the absence of board content and desktop pageviews.
An HTTP success or a green desktop CI build does not prove provider ingestion; allow
the provider's normal processing delay before treating a missing event as a failure.
If `mailto:` opens an empty browser window, compare the system result of
`open 'mailto:gbartoloni@proton.me'` on macOS before attributing it to Tauri.
The opener delegates to the OS-configured default mail handler.

Desktop CI runs locked Rust tests and `npm run desktop:build -- --no-bundle`. That verifies
native logic and compilation but does not execute a bundled WebView, enforce the production Tauri CSP, exercise opener
permissions or fullscreen, or prove offline GUI behavior. Therefore a passing CI run
cannot replace this pre-distribution gate.
