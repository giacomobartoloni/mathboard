#!/usr/bin/env python3
# MathBoard
#
# Copyright (C) 2026 Giacomo Bartoloni
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.

"""Exercise both MCP protocol eras against the harmless pinned-RMCP probe."""

import json
import os
import queue
import subprocess
import sys
import threading
from pathlib import Path

BINARY = Path(__file__).parent / "target/release" / (
    "mathboard-phase-d-probe.exe" if os.name == "nt" else "mathboard-phase-d-probe")
MODERN_META = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": {"name": "mathboard-d0-fixture", "version": "0.1"},
    "io.modelcontextprotocol/clientCapabilities": {},
}


def response_line(process, method):
    lines = queue.Queue(maxsize=1)
    threading.Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True).start()
    try:
        line = lines.get(timeout=5)
    except queue.Empty as error:
        raise AssertionError(f"No response to {method} within five seconds") from error
    assert line, f"Server closed stdout during {method}"
    return json.loads(line)


def request(process, request_id, method, params):
    payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
    process.stdin.write(json.dumps(payload) + "\n")
    process.stdin.flush()
    response = response_line(process, method)
    assert response["id"] == request_id, response
    assert "error" not in response, response
    return response["result"]


def rejected_request(process, request_id, method, params):
    payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
    process.stdin.write(json.dumps(payload) + "\n")
    process.stdin.flush()
    response = response_line(process, method)
    assert response["id"] == request_id and "error" in response, response
    return response["error"]


def session(modern):
    with subprocess.Popen([str(BINARY)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, text=True, bufsize=1,
                          env={**os.environ, "RUST_LOG": "trace"}) as process:
        if modern:
            discovery = request(process, "discover", "server/discover", {"_meta": MODERN_META})
            assert "2026-07-28" in discovery["supportedVersions"], discovery
            assert discovery["resultType"] == "complete", discovery
            meta = MODERN_META
            unsupported = {**MODERN_META, "io.modelcontextprotocol/protocolVersion": "9999-01-01"}
            assert rejected_request(process, "unsupported", "tools/list", {"_meta": unsupported})["code"] < 0
        else:
            initialized = request(process, "initialize", "initialize", {
                "protocolVersion": "2025-11-25", "capabilities": {},
                "clientInfo": {"name": "mathboard-d0-fixture", "version": "0.1"},
            })
            assert initialized["protocolVersion"] == "2025-11-25", initialized
            process.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
            process.stdin.flush()
            meta = None

        if modern:
            process.stdin.write("x" * (64 * 1024 + 1) + "\n")
            process.stdin.flush()

        listed = request(process, "list", "tools/list", {"_meta": meta} if meta else {})
        assert [tool["name"] for tool in listed["tools"]] == ["mathboard_probe"], listed
        called = request(process, "call", "tools/call", {
            "_meta": meta, "name": "mathboard_probe", "arguments": {},
        } if meta else {"name": "mathboard_probe", "arguments": {}})
        assert called["content"][0]["text"] == "mathboard-probe-ok", called
        if modern:
            assert called["resultType"] == "complete", called
            process.stdin.write('{"jsonrpc":"2.0","method":"D0_SENTINEL_PRIVATE","params":\n')
            process.stdin.flush()
        else:
            assert "resultType" not in called, called
        process.stdin.close()
        assert process.wait(timeout=5) == 0
        assert process.stderr.read() == ""


def broken_stdout():
    with subprocess.Popen([str(BINARY)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, text=True, bufsize=1) as process:
        process.stdout.close()
        try:
            process.stdin.write(json.dumps({"jsonrpc": "2.0", "id": "discover",
                "method": "server/discover", "params": {"_meta": MODERN_META}}) + "\n")
            process.stdin.flush()
        except BrokenPipeError:
            pass
        process.stdin.close()
        assert process.wait(timeout=5) == 0
        assert process.stderr.read() == ""


if __name__ == "__main__":
    if not BINARY.is_file():
        sys.exit("Build the pinned probe with cargo build --release --locked first")
    session(modern=True)
    session(modern=False)
    broken_stdout()
    print("D0 pinned RMCP probe: modern/legacy, input cap, stderr and EOF passed")
