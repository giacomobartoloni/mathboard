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

# Local Agent Dev Bridge

The Local Agent Dev Bridge lets a coding agent use the running MathBoard during local development. It sends semantic commands to the existing `BoardController` in the browser. The bridge is development plumbing: it is not a production API, MCP server, multiplayer transport, or a new board model.

## Start the bridge

Run the explicit agent-mode development command:

```bash
npm run dev:agent
```

Open `http://127.0.0.1:5173` in one browser tab and wait for MathBoard to finish loading. The server must bind only to `127.0.0.1`; do not expose it on `0.0.0.0` or the local network. Normal `npm run dev` and production builds do not provide the bridge.

Check transport readiness:

```bash
curl -s http://127.0.0.1:5173/__mathboard_agent/health
```

Once the browser is connected, the response should look like:

```json
{
  "ok": true,
  "browserConnected": true,
  "pendingCommands": 0
}
```

`browserConnected` means the browser transport is connected. It does not mean the board is ready for a mutation. Send `observe` and proceed only when its result has `stable: true`.

## Command API

Send JSON to `POST /__mathboard_agent/command`. The Vite relay creates the request ID; callers do not need to create correlation IDs. The only supported methods are:

| Method | Parameters |
| --- | --- |
| `observe` | No required parameters |
| `create` | `spec`, optional `options` |
| `createMany` | `specs`, optional `options` |
| `update` | `id`, `patch`, optional `options` |
| `delete` | `id` |

The bridge delegates these commands to the corresponding `BoardController` methods and returns their semantic JSON results. It does not expose Fabric, history internals, persistence, or arbitrary method execution.

### Observe

```bash
curl -s -X POST http://127.0.0.1:5173/__mathboard_agent/command \
  -H 'content-type: application/json' \
  -d '{"method":"observe","params":{}}'
```

A stable observation has this general shape (object contents depend on the board):

```json
{
  "ok": true,
  "result": {
    "version": 1,
    "stable": true,
    "boardId": "mb_...",
    "viewport": {
      "zoom": 1,
      "width": 1440,
      "height": 900,
      "transform": [1, 0, 0, 1, 0, 0]
    },
    "selection": { "ids": [] },
    "objects": []
  }
}
```

During startup, `observe` may return `stable: false` and `boardId: null`. The caller should retry observation when appropriate; the bridge does not poll on the caller's behalf.

### Create one object

```bash
curl -s -X POST http://127.0.0.1:5173/__mathboard_agent/command \
  -H 'content-type: application/json' \
  -d '{
    "method": "create",
    "params": {
      "spec": {
        "type": "formula",
        "latex": "x^2=4",
        "left": 300,
        "top": 220
      }
    }
  }'
```

### Create several objects

```bash
curl -s -X POST http://127.0.0.1:5173/__mathboard_agent/command \
  -H 'content-type: application/json' \
  -d '{
    "method": "createMany",
    "params": {
      "specs": [
        { "type": "text", "text": "Solve", "left": 250, "top": 150 },
        { "type": "formula", "latex": "x^2=4", "left": 250, "top": 220 }
      ],
      "options": { "select": false }
    }
  }'
```

### Update and delete

Use the semantic object ID returned by `create`, `createMany`, or `observe`:

```bash
curl -s -X POST http://127.0.0.1:5173/__mathboard_agent/command \
  -H 'content-type: application/json' \
  -d '{"method":"update","params":{"id":"mbobj_...","patch":{"left":420,"top":250}}}'
```

```bash
curl -s -X POST http://127.0.0.1:5173/__mathboard_agent/command \
  -H 'content-type: application/json' \
  -d '{"method":"delete","params":{"id":"mbobj_..."}}'
```

Re-observe after each change to confirm the board's current state. Formula updates should use the same `update` method with a patch such as `{"latex":"x=2"}`.

## Recommended agent workflow

1. Start `npm run dev:agent` and make sure a browser is open at `http://127.0.0.1:5173`.
2. Check `/__mathboard_agent/health` until `browserConnected` is `true`.
3. Call `observe`; mutate only when `result.stable` is `true`.
4. Use `create`, `createMany`, `update`, and `delete` with semantic data.
5. Call `observe` after changes and use its result as the source of truth.
6. If a transport request fails during a browser reload, observe the board before retrying a mutation. The original command may have committed just before the connection dropped.

The bridge does not automatically replay mutating commands. This avoids duplicate objects when a request fails after a command may already have reached the board.

## Coordinates and layout

Until MathBoard provides layout support, specify `left` and `top` explicitly. A useful starting convention is around `x=200, y=150`, with about 80–120 px between rows and 150–250 px between columns. These are suggestions for the caller; the bridge does not calculate layout or avoid collisions.

## Connection and errors

V1 controls one browser tab per Vite agent server. A newly connected tab replaces the previous connection. On reload or HMR, wait for the browser to reconnect and check health again. Ordinary source edits should work with Vite HMR; changes to the Vite plugin or server middleware may require restarting the command.

Transport failures use these HTTP statuses:

| Status | Meaning |
| --- | --- |
| `400` | Malformed command |
| `404` | Unknown relay endpoint or result ID |
| `409` | BoardController rejected the command |
| `503` | No browser board is connected |
| `504` | Command timed out |

BoardController errors return a concise `code` and `message`. A transport error describes delivery or relay state; it does not always establish whether a mutation committed. Observe before deciding whether to retry.

## Scope

V1 exposes only `observe`, `create`, `createMany`, `update`, and `delete`. It has no clear, undo, redo, grouping, screenshot, auto-layout, remote access, authentication, MCP, or multiplayer API. Use the MathBoard UI for human actions such as Undo and Redo. Keep the bridge as a caller of `BoardController`; do not use it to access Fabric or Vue internals.

After using the bridge in real development, record repeated friction before proposing more commands. In particular, check whether coordinates, observation detail, board dimensions, or a missing operation repeatedly block useful work.
