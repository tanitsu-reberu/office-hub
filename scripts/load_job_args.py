"""Load MCP job args dict. Usage: py load_job_args.py <job_index>"""
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).parent
JOBS = [
    "_mcp_invoke_office-3d.js.json",
    "_mcp_invoke_office.js.json",
    "_mcp_invoke_server.py.json",
    "_mcp_push_package-lock.json",
    "_create_static__vendor__three.min.js.json",
    "_create_static__scene__office-scene.js.json",
]

idx = int(sys.argv[1])
data = json.loads((SCRIPTS / JOBS[idx]).read_text(encoding="utf-8"))
args = data.get("arguments", data)
sys.stdout.reconfigure(encoding="utf-8")
json.dump(args, sys.stdout, ensure_ascii=False)