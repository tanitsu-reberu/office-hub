#!/usr/bin/env python3
"""Set GitHub Actions variables and HUB_TOKEN secret for office-hub Pages build."""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

OWNER = "tanitsu-reberu"
REPO = "office-hub"
DEFAULT_HUB_API = "https://office-hub-production.up.railway.app"
DEFAULT_HUB_BASE = "/office-hub"


def load_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def git_credential_token() -> str:
    proc = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True,
        text=True,
        timeout=15,
    )
    if proc.returncode != 0:
        return ""
    for line in proc.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    return ""


def github_token() -> str:
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        return token
    env = load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    token = env.get("GITHUB_TOKEN", "").strip()
    if token:
        return token
    return git_credential_token()


def api_request(
    method: str,
    url: str,
    token: str,
    body: dict | None = None,
) -> tuple[int, dict | str]:
    data = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            if not raw:
                return resp.status, {}
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = raw
        return exc.code, payload


def ensure_pynacl():
    try:
        from nacl import encoding, public  # noqa: F401
    except ImportError:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "pynacl", "-q"],
            stdout=subprocess.DEVNULL,
        )


def encrypt_secret(public_key_b64: str, secret_value: str) -> str:
    ensure_pynacl()
    from nacl import encoding, public

    pk = public.PublicKey(public_key_b64.encode("utf-8"), encoding.Base64Encoder())
    sealed = public.SealedBox(pk).encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(sealed).decode("utf-8")


def set_variable(token: str, name: str, value: str) -> None:
    base = f"https://api.github.com/repos/{OWNER}/{REPO}/actions/variables"
    status, _ = api_request("GET", f"{base}/{name}", token)
    method = "PATCH" if status == 200 else "POST"
    url = f"{base}/{name}" if method == "PATCH" else base
    body = {"name": name, "value": value}
    code, payload = api_request(method, url, token, body)
    if code not in (200, 201, 204):
        raise RuntimeError(f"variable {name} failed ({code}): {payload}")


def set_secret(token: str, name: str, value: str) -> None:
    pk_url = f"https://api.github.com/repos/{OWNER}/{REPO}/actions/secrets/public-key"
    code, payload = api_request("GET", pk_url, token)
    if code != 200 or not isinstance(payload, dict):
        raise RuntimeError(f"public-key failed ({code}): {payload}")
    encrypted = encrypt_secret(payload["key"], value)
    sec_url = f"https://api.github.com/repos/{OWNER}/{REPO}/actions/secrets/{name}"
    code, resp = api_request(
        "PUT",
        sec_url,
        token,
        {"encrypted_value": encrypted, "key_id": payload["key_id"]},
    )
    if code not in (201, 204):
        raise RuntimeError(f"secret {name} failed ({code}): {resp}")


def main() -> int:
    token = github_token()
    if not token:
        print(
            "No GitHub token. Set GITHUB_TOKEN in .env or run: git credential fill",
            file=sys.stderr,
        )
        return 1

    root = Path(__file__).resolve().parent.parent
    env = load_dotenv(root / ".env")
    hub_token = env.get("HUB_TOKEN", "").strip()
    if not hub_token:
        print("HUB_TOKEN missing in office-hub/.env", file=sys.stderr)
        return 1

    hub_api = os.getenv("HUB_API", DEFAULT_HUB_API).strip() or DEFAULT_HUB_API
    hub_base = os.getenv("HUB_BASE", DEFAULT_HUB_BASE).strip() or DEFAULT_HUB_BASE

    print(f"Setting HUB_API={hub_api}")
    set_variable(token, "HUB_API", hub_api)
    print(f"Setting HUB_BASE={hub_base}")
    set_variable(token, "HUB_BASE", hub_base)
    print("Setting secret HUB_TOKEN")
    set_secret(token, "HUB_TOKEN", hub_token)
    print("OK: GitHub Actions variables and secret configured")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())