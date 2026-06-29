"""Load github_batch_0.json and print MCP push_files arguments as JSON to stdout."""
import json
import sys
from pathlib import Path

BATCH = Path(__file__).resolve().parent / "github_batch_0.json"
files = json.load(open(BATCH, encoding="utf-8"))
args = {
    "owner": "tanitsu-reberu",
    "repo": "office-hub",
    "branch": "main",
    "message": "Initial commit: Team Office Hub (batch 1/3)",
    "files": files,
}
sys.stdout.reconfigure(encoding="utf-8")
json.dump(args, sys.stdout, ensure_ascii=False)