"""Print create_or_update_file args from _create_*.json. Usage: py mcp_create_from_json.py <repo-path>"""
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).parent
repo_path = sys.argv[1]
key = repo_path.replace("/", "__")
matches = sorted(SCRIPTS.glob(f"_create_{key}.json"))
if not matches:
    print(f"NO_MATCH for {repo_path}", file=sys.stderr)
    sys.exit(1)
data = json.loads(matches[0].read_text(encoding="utf-8"))
sys.stdout.reconfigure(encoding="utf-8")
json.dump(data, sys.stdout, ensure_ascii=False)