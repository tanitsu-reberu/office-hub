"""Emit CallMcpTool payload path for job. Usage: py mcp_call_job.py <idx>"""
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).parent
TOOLS = [
    "create_or_update_file",
    "create_or_update_file",
    "create_or_update_file",
    "push_files",
    "create_or_update_file",
    "create_or_update_file",
]
idx = int(sys.argv[1])
args = json.loads((SCRIPTS / f"_out_job_{idx}.json").read_text(encoding="utf-8"))
payload = {"server": "grok_com_github", "toolName": TOOLS[idx], "arguments": args}
out = SCRIPTS / f"_CALLMCP_{idx}.json"
out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
clen = len(args.get("content") or args["files"][0]["content"])
print(json.dumps({"file": str(out), "tool": TOOLS[idx], "content_len": clen}))