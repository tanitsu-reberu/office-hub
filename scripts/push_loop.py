"""Load step push JSON and print summary; writes per-file create_or_update args."""
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).parent
BATCH0 = SCRIPTS / "github_batch_0.json"

batch0 = {f["path"]: f["content"] for f in json.load(open(BATCH0, encoding="utf-8"))}

# paths still needed (update as we go)
NEEDED = [
    "scene/package-lock.json",
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
    "scene/src/OfficeScene.tsx",
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

if len(sys.argv) > 1:
    p = sys.argv[1]
    out = {
        "owner": "tanitsu-reberu",
        "repo": "office-hub",
        "branch": "main",
        "message": "Initial commit: Team Office Hub (batch 1/3)",
        "path": p,
        "content": batch0[p],
    }
    dest = SCRIPTS / f"_single_{p.replace('/', '__')}.json"
    dest.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(dest, len(batch0[p]))
else:
    for p in NEEDED:
        print(p, len(batch0[p]))