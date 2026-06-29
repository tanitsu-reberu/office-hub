"""Build push_files args from local office-hub for all missing batch-0 paths."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
BATCH0 = SCRIPTS / "github_batch_0.json"

REPO_PATHS = {
    ".env.example", ".github/workflows/pages.yml", ".gitignore", "Dockerfile", "PLAN.md",
    "README-launcher.md", "README.md", "bridge/README.md", "cursor_tools.py", "deploy/README.md",
    "design/office-themes-spec.md", "design/user-cubicle-qa-spec.md", "install-game-shortcut.ps1",
    "install-mcp.ps1", "install-office-autostart.ps1", "launch-office.bat", "launch-office.ps1",
    "mcp_server.py", "pick-folder.ps1", "requirements.txt", "scene/.gitignore",
    "scene/src/vite-env.d.ts", "scene/tsconfig.json", "scene/tsconfig.node.json", "scene/vite.config.ts",
    "scripts/prepare-pages.ps1", "start-office-lan.ps1", "start-office-tunnel.ps1", "start-office.bat",
    "start-office.ps1", "static/hub-config.js", "static/manifest.json", "static/office-2d-fallback.js",
    "design/bright-office-spec.md",
}

batch0 = json.load(open(BATCH0, encoding="utf-8"))
missing = [f for f in batch0 if f["path"] not in REPO_PATHS]
print("missing", len(missing))

batches = []
cur = []
cur_size = 0
MAX = 16000
for f in missing:
    sz = len(f["content"]) + len(f["path"])
    if cur and cur_size + sz > MAX:
        batches.append(cur)
        cur = []
        cur_size = 0
    cur.append({"path": f["path"], "content": f["content"]})
    cur_size += sz
if cur:
    batches.append(cur)

for i, b in enumerate(batches):
    args = {
        "owner": "tanitsu-reberu",
        "repo": "office-hub",
        "branch": "main",
        "message": "Initial commit: Team Office Hub (batch 1/3)",
        "files": b,
    }
    out = SCRIPTS / f"_step_push_{i}.json"
    out.write_text(json.dumps(args, ensure_ascii=False), encoding="utf-8")
    paths = [x["path"] for x in b]
    print(f"step {i}: {len(b)} files, {out.stat().st_size} bytes")
    print("  ", paths)