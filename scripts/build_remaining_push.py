import json
from pathlib import Path

BATCH0 = Path(__file__).parent / "github_batch_0.json"
SCRIPTS = Path(__file__).parent

batch0 = json.load(open(BATCH0, encoding="utf-8"))
by_path = {f["path"]: f for f in batch0}

missing = [
    "design/bright-office-spec.md",
    "scene/package-lock.json",
    "scene/package.json",
    "scene/src/OfficeScene.tsx",
    "scene/src/bridge-api.ts",
    "scene/src/bridge.tsx",
    "scene/src/components/Agent.tsx",
    "scene/src/components/AgentLabel.tsx",
    "scene/src/components/BloomLight.tsx",
    "scene/src/components/CameraRig.tsx",
    "scene/src/components/Cubicle.tsx",
    "scene/src/components/DeferredPostFX.tsx",
    "scene/src/components/DomLabels.tsx",
    "scene/src/components/Floor.tsx",
    "scene/src/components/Lighting.tsx",
    "scene/src/components/MeetingPlatform.tsx",
    "scene/src/components/OfficeDressing.tsx",
    "scene/src/components/PostFX.tsx",
    "scene/src/components/SceneErrorBoundary.tsx",
    "scene/src/components/UserCubicle.tsx",
    "scene/src/constants.ts",
    "scene/src/notifications.ts",
    "scene/src/quality.ts",
    "scene/src/state/officeStore.ts",
    "scene/src/theme/palette.ts",
    "scene/src/theme/palettes.ts",
    "scene/src/utils/bloomRegistry.ts",
    "server.py",
    "static/index.html",
    "static/office-3d.js",
    "static/office.css",
    "static/office.js",
]

remaining = [by_path[p] for p in missing]
out = SCRIPTS / "_remaining_push.json"
json.dump(
    {
        "owner": "tanitsu-reberu",
        "repo": "office-hub",
        "branch": "main",
        "message": "Initial commit: Team Office Hub (batch 1/3)",
        "files": remaining,
    },
    open(out, "w", encoding="utf-8"),
    ensure_ascii=False,
    separators=(",", ":"),
)
print("saved", len(remaining), "files", out.stat().st_size, "bytes")

batches = []
cur = []
cur_size = 0
for f in remaining:
    sz = len(f["content"]) + len(f["path"])
    if cur and cur_size + sz > 18000:
        batches.append(cur)
        cur = []
        cur_size = 0
    cur.append(f)
    cur_size += sz
if cur:
    batches.append(cur)

for i, b in enumerate(batches):
    p = SCRIPTS / f"_rem_push_{i}.json"
    json.dump(b, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    paths = [x["path"] for x in b]
    print(f"_rem_push_{i}: {len(b)} files, {p.stat().st_size} bytes, paths={paths}")