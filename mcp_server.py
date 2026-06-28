#!/usr/bin/env python3
"""Minimal stdio MCP server for Team Office Hub (Python 3.9+)."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

HUB_URL = os.getenv("HUB_URL", "http://127.0.0.1:8765").rstrip("/")
HUB_TOKEN = os.getenv("HUB_TOKEN", "").strip()
DEFAULT_AGENT = os.getenv("HUB_AGENT", "backend")
PROTOCOL_VERSION = "2024-11-05"


def _headers() -> dict[str, str]:
    h = {"Content-Type": "application/json"}
    if HUB_TOKEN:
        h["X-Hub-Token"] = HUB_TOKEN
    return h


def _hub_request(method: str, path: str, body: Optional[dict[str, Any]] = None) -> Any:
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{HUB_URL}{path}",
        data=data,
        headers=_headers(),
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("detail", exc.reason)
        except Exception:
            detail = exc.reason
        raise RuntimeError(f"Hub {exc.code}: {detail}") from exc


def _ok(msg_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _err(msg_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def handle_message(msg: dict[str, Any]) -> Optional[dict[str, Any]]:
    method = msg.get("method")
    msg_id = msg.get("id")
    params = msg.get("params") or {}

    if method == "initialize":
        return _ok(
            msg_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "office-hub", "version": "1.0.0"},
            },
        )

    if method == "notifications/initialized":
        return None

    if method == "tools/list":
        data = _hub_request("GET", "/api/cursor/tools")
        tools = [
            {
                "name": t["name"],
                "description": t.get("description", ""),
                "inputSchema": t.get("inputSchema", {"type": "object", "properties": {}}),
            }
            for t in data.get("tools", [])
        ]
        return _ok(msg_id, {"tools": tools})

    if method == "tools/call":
        name = params.get("name")
        arguments = dict(params.get("arguments") or {})
        agent = arguments.pop("agent", None) or DEFAULT_AGENT
        chat_id = arguments.pop("chat_id", None)
        body: dict[str, Any] = {"tool": name, "arguments": arguments, "agent": agent}
        if chat_id is not None:
            body["chat_id"] = chat_id
        try:
            data = _hub_request("POST", "/api/cursor/tools/invoke", body)
            text = json.dumps(data, ensure_ascii=False, indent=2)
            return _ok(
                msg_id,
                {"content": [{"type": "text", "text": text}], "isError": False},
            )
        except Exception as exc:
            return _ok(
                msg_id,
                {
                    "content": [{"type": "text", "text": f"Error: {exc}"}],
                    "isError": True,
                },
            )

    if msg_id is not None:
        return _err(msg_id, -32601, f"Method not found: {method}")
    return None


def main() -> None:
    if not HUB_TOKEN:
        print("HUB_TOKEN missing. Run launch-office.ps1 or install-mcp.ps1", file=sys.stderr)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            resp = handle_message(msg)
            if resp is not None:
                print(json.dumps(resp, ensure_ascii=False), flush=True)
        except json.JSONDecodeError as exc:
            print(json.dumps(_err(None, -32700, str(exc)), ensure_ascii=False), flush=True)
        except Exception as exc:
            msg_id = None
            try:
                msg_id = json.loads(line).get("id")
            except Exception:
                pass
            if msg_id is not None:
                print(json.dumps(_err(msg_id, -32603, str(exc)), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()