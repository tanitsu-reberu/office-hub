"""Load invoke JSON for MCP. Usage: py load_invoke_json.py <file>"""
import json
import sys
from pathlib import Path

args = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
sys.stdout.reconfigure(encoding="utf-8")
json.dump(args, sys.stdout, ensure_ascii=False)