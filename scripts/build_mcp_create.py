"""Build create_or_update_file args from local file or batch JSON.
Usage: py build_mcp_create.py <repo-path> [--sha SHA] [--message MSG]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
MSG = "Initial commit: Team Office Hub (batch 1/3)"


def load_from_batches(repo_path: str) -> str:
    for name in ("github_batch_0.json", "github_batch_1.json", "github_batch_2.json"):
        p = SCRIPTS / name
        if not p.exists():
            continue
        for item in json.loads(p.read_text(encoding="utf-8")):
            if item["path"] == repo_path:
                return item["content"]
    local = ROOT / repo_path.replace("/", "\\")
    if local.exists():
        return local.read_text(encoding="utf-8")
    raise SystemExit(f"NOT FOUND: {repo_path}")


def main() -> None:
    repo_path = sys.argv[1]
    sha = None
    message = MSG
    args = sys.argv[2:]
    i = 0
    while i < len(args):
        if args[i] == "--sha" and i + 1 < len(args):
            sha = args[i + 1]
            i += 2
        elif args[i] == "--message" and i + 1 < len(args):
            message = args[i + 1]
            i += 2
        else:
            i += 1
    content = load_from_batches(repo_path)
    out = {
        "owner": "tanitsu-reberu",
        "repo": "office-hub",
        "branch": "main",
        "message": message,
        "path": repo_path,
        "content": content,
    }
    if sha:
        out["sha"] = sha
    key = repo_path.replace("/", "__")
    path = SCRIPTS / f"_create_{key}.json"
    path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(path.name, len(content), "sha=" + (sha or "new"))


if __name__ == "__main__":
    main()