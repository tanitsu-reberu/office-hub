"""Print MCP job args as single-line JSON for agent piping. Usage: py mcp_invoke_job.py <job_index>"""
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
TOOLS = [
    "create_or_update_file",
    "create_or_update_file",
    "create_or_update_file",
    "push_files",
    "create_or_update_file",
    "create_or_update_file",
]

idx = int(sys.argv[1])
data = json.loads((SCRIPTS / JOBS[idx]).read_text(encoding="utf-8"))
args = data.get("arguments", data)
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps({"tool": TOOLS[idx], "arguments": args}, ensure_ascii=False))