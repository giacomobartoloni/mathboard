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
| Formula | Insert and edit a KaTeX formula; verify the rendered canvas image | Repeat; inspect raster clarity | Repeat; inspect raster clarity | Repeat; inspect raster clarity |
| Selection | Multi-select objects, transform them, delete them, and restore them | Repeat | Repeat | Repeat |
| Pan and zoom | Pan, zoom from 0.1× to 5×, and switch tools while zoomed | Repeat with trackpad and mouse | Repeat with mouse and available touchpad | Repeat with mouse and available touchpad |
| History | Verify one undo entry per pencil, shape, text, formula, delete, and transform gesture; redo each action | Repeat | Repeat | Repeat |
| History boundary | Make a new edit after undo and confirm the redo tail is dropped; exercise the 50-entry cap | Repeat | Repeat | Repeat |
| Theme preference | Change the board theme, reload, and confirm it persists | Change the theme, close and reopen, and confirm it persists | Repeat | Repeat |
| Fullscreen | Enter and exit fullscreen where the browser supports it | Verify the control works or degrades safely in WKWebView | Verify the control works or degrades safely in WebView2 | Verify the control works or degrades safely in WebKitGTK |
| External links | Verify HTTPS and `mailto:` links; Privacy Policy uses same-origin `/privacy-policy.html` | Verify links open in the default native handler; Privacy Policy opens `https://mathboard.app/privacy-policy.html` | Repeat | Repeat |
| Security smoke test | Check the production browser console for CSP errors | Check expected resources load under the Tauri CSP; the Simple Analytics request is expected to be blocked | Repeat | Repeat |
| Session lifecycle | Reload and confirm canvas and history are lost as documented | Close and reopen; confirm canvas and history are lost while theme persists | Repeat | Repeat |

## Expected persistence behavior

MathBoard has no document open/save feature. Canvas contents and the command-log
undo/redo history are held in memory only. Losing them after reload, window close, or
application exit is expected in every environment and must not be mistaken for a
platform-specific regression. UI preferences such as the selected theme may persist
through `localStorage` in the environment's application data.

## Pre-distribution gate

Before shipping any installer, run every native row above against a bundled release
candidate on each target operating system, including CSP, formula insert/edit, HTTPS
and `mailto:` opener behavior, Privacy Policy, fullscreen, and an offline cold start.
Record the application version, OS version, package format, and native WebView version.

Desktop CI uses `npm run desktop:build -- --no-bundle`. That verifies compilation but
does not execute a bundled WebView, enforce the production Tauri CSP, exercise opener
permissions or fullscreen, or prove offline GUI behavior. Therefore a passing CI run
cannot replace this pre-distribution gate.
