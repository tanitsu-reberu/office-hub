"""Print MCP push_files args for each remaining batch (for agent invocation)."""
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).parent
OWNER = "tanitsu-reberu"
REPO = "office-hub"
BRANCH = "main"
MESSAGE = "Initial commit: Team Office Hub (batch 1/3)"

if len(sys.argv) < 2:
    batches = sorted(SCRIPTS.glob("_rem_push_*.json"))
    for p in batches:
        print(p.name)
    sys.exit(0)

idx = sys.argv[1]
path = SCRIPTS / f"_rem_push_{idx}.json"
files = json.load(open(path, encoding="utf-8"))
args = {
    "owner": OWNER,
    "repo": REPO,
    "branch": BRANCH,
    "message": MESSAGE,
    "files": files,
}
sys.stdout.reconfigure(encoding="utf-8")
json.dump(args, sys.stdout, ensure_ascii=False)