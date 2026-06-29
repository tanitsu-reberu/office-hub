"""Print MCP args for a step index. Usage: py mcp_push_steps.py <step> [--single]"""
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).parent
step = sys.argv[1]
single = "--single" in sys.argv

path = SCRIPTS / f"_step_push_{step}.json"
data = json.load(open(path, encoding="utf-8"))

if single:
    f = data["files"][0]
    out = {
        "owner": data["owner"],
        "repo": data["repo"],
        "branch": data["branch"],
        "message": data["message"],
        "path": f["path"],
        "content": f["content"],
    }
else:
    out = data

sys.stdout.reconfigure(encoding="utf-8")
json.dump(out, sys.stdout, ensure_ascii=False)