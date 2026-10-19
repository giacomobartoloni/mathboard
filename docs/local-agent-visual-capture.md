<!--
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

# Local Agent Visual Capture (F017)

Start `npm run dev:agent`, open `http://127.0.0.1:5173` in one local browser tab, and wait for `observe.result.stable`. The bridge captures that connected board, including unsaved changes. It never launches another board from persistence.

Send `screenshot` to the existing `POST /__mathboard_agent/command`. Exactly one target is required:

```json
{"method":"screenshot","params":{"target":{"kind":"sceneRect","rect":{"x":200,"y":120,"width":800,"height":600}},"scale":1,"format":"png"}}
```

```json
{"method":"screenshot","params":{"target":{"kind":"objectIds","ids":["mbobj_existing"],"padding":16}}}
```

```json
{"method":"screenshot","params":{"target":{"kind":"viewport"},"scale":0.5}}
```

Scene rectangles and object bounds use scene units, independent of pan/zoom. Object IDs must be distinct existing top-level semantic IDs; nested children cannot be targeted individually. Groups and formulas are captured as rendered atomic objects. Bounds include Fabric transforms and stroke geometry. Padding defaults to 16 scene units (0–128). Invisible objects do not contribute bounds; a wholly invisible requested set is rejected. The crop includes everything rendered inside that region, including overlapping unrequested objects.

Viewport captures use the canvas CSS dimensions and its actual transform, without retina multiplication. They exclude DOM controls, selection handles and tool previews. For toolbar occlusion or whole-workspace review, continue using `e2e/helpers/visual-observation.js` and `e2e/visual-observation.spec.js`; canvas evidence alone cannot establish that the toolbar does not cover content.

## Result and local image review

Success uses the existing `{ok:true,result:...}` envelope. Result fields are `mimeType: "image/png"`, `encoding: "base64"`, `data`, `widthPx`, `heightPx`, `region`, `scale`, `boardId`, and `observationVersion:1`. The latter identifies the existing observation schema (`serializeBoardState().version`), not a scene revision. Associate captures with observations using board ID, region and the unchanged board state; do not treat version 1 as a content counter.

Pixel dimensions round upward: `ceil(sourceSize * scale)`. Region width/height report the effective dimensions `pixels / scale`; sceneRect additionally preserves `requestedRect`. Object targets include requested IDs, padding and actual `unionBounds`; viewport includes `coordinateSpace:"viewport"` and a copy of `viewportTransform`. Scene targets use `coordinateSpace:"scene"`.

This Node 22 example saves only the decoded PNG, without printing pixels/base64 to logs:

```js
import { writeFile } from 'node:fs/promises'
const response = await fetch('http://127.0.0.1:5173/__mathboard_agent/command', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({method:'screenshot',params:{target:{kind:'viewport'},scale:0.5}}),
})
const body = await response.json()
if (!response.ok || !body.ok) throw new Error(body.error?.code || 'capture_failed')
await writeFile('/private/tmp/mathboard-capture.png', Buffer.from(body.result.data, 'base64'))
```

Open the resulting PNG with the coding harness's image-view tool, or attach it to a multimodal message as an image. The image does not become visible to a language-only tool merely because an HTTP call succeeded. Keep artifacts local and use synthetic content in tests; do not commit real student material.

Review actual pixels for clipped fractions/exponents, formula/text overlap, alignment, legibility, margins and grouping geometry. A screenshot is evidence for review, never automatic proof of good layout.

## Readiness and read-only rendering

The adapter waits for `document.fonts.ready` and two animation frames, with a 10-second capture deadline. It refuses active drawing, text editing, transformations, pending bridge mutations and pending formula rendering. After cloning and encoding, it verifies that the same board, scene and viewport remain current. Failures return no partial image.

Actual rendered Fabric vectors are cloned into a separate `StaticCanvas`; formulas are not re-typeset. Capture does not call the live canvas export, change live pan/zoom/selection, write persistence or append history. External image resources, canvas background/overlay images, canvas clipping paths and unsupported background paints fail safely. The current local canvas grid pattern is supported. Hidden/export-excluded group children follow rendered visibility, rather than stamp-export filtering.

## Bounds and errors

| Limit | Value |
| --- | --- |
| Scale | 0.5–3, default 1 |
| Output dimension | 2048 px per side |
| Output area | 2,097,152 pixels |
| Decoded PNG | 5 MiB |
| Browser result JSON body | 7 MiB, streaming bound |
| Command JSON body | 64 KiB, streaming bound |
| Concurrent relay commands / captures | 16 / 2 |
| Body / capture / command deadline | 10 / 10 / 30 seconds |
| Scene roots / total rendered nodes / depth / serialized scene bytes | 2000 / 10000 / 64 / 8 MiB |

Domain failures use HTTP 409 with `invalid_capture_request`, `object_not_found`, `board_not_ready`, `capture_too_large`, or `capture_failed`. Unknown options, invalid numbers, duplicate IDs and unsupported formats fail explicitly. Output-limit failures never return truncated PNGs.

Transport failures include 403 `forbidden_origin`, 408 `request_timeout`, 413 `request_too_large`, 429 `local_agent_busy`, 503 `board_unavailable` / `board_disconnected`, and 504 `command_timeout`. Malformed envelopes/results use 400. Pending entries are released on completion, rejection, cancellation, timeout, disconnect, browser replacement and server close. A new browser tab replaces the old connection; observe again after reconnecting. Do not automatically replay mutations.

The relay remains opt-in, loopback-only and same-origin. Loopback binding is not user authentication: other local processes can call this development API. Requests without an Origin header (local CLI clients) are supported; cross-origin browser requests are rejected. No CORS, extra screenshot endpoint, remote asset fetch, arbitrary Fabric method exposure or PNG logging is added. Normal development and production builds do not load the capture adapter.

## F033 API discovery

F033's `GET /__mathboard_agent/help` is integrated with the live screenshot adapter in this branch. The build-specific command registry exposes exactly six methods: `observe`, `create`, `createMany`, `update`, `delete`, and `screenshot`. The screenshot entry derives from `getScreenshotDescriptor()`, sharing its three target schemas, pixel/byte limits, return media format and specific error codes. Only one executable screenshot closure exists, and the Vite relay and browser dispatch both validate against the same registry.

Help remains read-only and can be called without a connected browser. The screenshot method has `mutatesBoard:false` but `requiresStable:true`; discovery and result transport do not weaken the existing capture readiness, size, loopback/Origin, and non-mutating guarantees. The description is metadata for local LLM adapters; it does not grant authorization and does not expose a production API.

See [Local Agent API Help](local-agent-api-help.md) for the machine-readable discovery contract. The regression suite verifies method parity, actual PNG image responses, help stability and normal/production mode exclusion.

## Verification

```sh
npm run test:unit
npm run test:agent-bridge
npm run test:e2e
npm run lint
npm run build
npm run assert:no-e2e-hook
```

`e2e-agent/local-agent-capture.spec.js` exercises the real HTTP relay and attaches decoded PNGs to the Playwright report. Inspect those images in addition to checking test outcomes. The existing workspace screenshot workflow remains independent.
