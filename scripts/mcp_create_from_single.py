"""Print create_or_update_file args from _single_* file. Usage: py mcp_create_from_single.py <glob-suffix>"""
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).parent
suffix = sys.argv[1] if len(sys.argv) > 1 else ""
matches = sorted(SCRIPTS.glob(f"_single_*{suffix}*"))
if not matches:
    print("NO_MATCH", file=sys.stderr)
    sys.exit(1)
path = matches[0]
data = json.load(open(path, encoding="utf-8"))
sys.stdout.reconfigure(encoding="utf-8")
json.dump(data, sys.stdout, ensure_ascii=False)