"""Load create_or_update args from _create_*.json and print path + sha hint. Usage: py run_mcp_create_one.py <repo-path>"""
import json
import sys
from pathlib import Path

path = sys.argv[1]
key = path.replace("/", "__")
create_file = Path(__file__).parent / f"_create_{key}.json"
args = json.loads(create_file.read_text(encoding="utf-8"))
print(json.dumps({"path": args["path"], "content_len": len(args["content"]), "keys": list(args.keys())}))