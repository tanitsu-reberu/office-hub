"""Print MCP push_files args JSON for a chunk index."""
import json
import sys
from pathlib import Path

idx = int(sys.argv[1])
chunk = json.load(open(Path(__file__).resolve().parent / f"_chunk_{idx}.json", encoding="utf-8"))
args = {
    "owner": "tanitsu-reberu",
    "repo": "office-hub",
    "branch": "main",
    "message": "Initial commit: Team Office Hub (batch 1/3)",
    "files": chunk,
}
sys.stdout.reconfigure(encoding="utf-8")
json.dump(args, sys.stdout, ensure_ascii=False)