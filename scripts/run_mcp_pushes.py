"""Print summary of pending MCP create_or_update pushes from _create_*.json / _mcp_invoke_*.json."""
import json
from pathlib import Path

SCRIPTS = Path(__file__).parent
JOBS = [
    ("static/office-3d.js", "_mcp_invoke_office-3d.js.json"),
    ("static/office.js", "_create_static__office.js.json"),
    ("server.py", "_mcp_invoke_server.py.json"),
    ("scene/package-lock.json", "_create_scene__package-lock.json.json"),
    ("static/vendor/three.min.js", "_create_static__vendor__three.min.js.json"),
    ("static/scene/office-scene.js", "_create_static__scene__office-scene.js.json"),
]
for path, fname in JOBS:
    p = SCRIPTS / fname
    if not p.exists():
        print("MISSING", fname)
        continue
    d = json.loads(p.read_text(encoding="utf-8"))
    print(f"{path}\t{len(d['content'])}\tsha={d.get('sha','new')}\t{fname}")