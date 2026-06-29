"""Team Office Hub — bridge between visual office and Cursor chat."""

from __future__ import annotations

import json
import os
import shlex
import shutil
import sqlite3
import subprocess
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import socket

from fastapi import FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import cursor_tools

ROOT = Path(__file__).resolve().parent

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

DATA_DIR = Path(os.getenv("DATA_DIR", str(ROOT)))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "office.db"
BRIDGE_DIR = DATA_DIR / "bridge"
BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
FROM_OFFICE = BRIDGE_DIR / "from-office.jsonl"
FROM_CURSOR = BRIDGE_DIR / "from-cursor.jsonl"
ACTIONS_LOG = BRIDGE_DIR / "actions.jsonl"
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_ATTACHMENTS_PER_MESSAGE = 7
MAX_READ_FILE_BYTES = 512 * 1024
MAX_LIST_DIR_ENTRIES = 500
GIT_STATUS_TIMEOUT_SEC = 15
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ACTIONS_ENABLED = os.getenv("ACTIONS_ENABLED", "1").strip().lower() not in ("0", "false", "no")
SESSIONS_ENABLED = os.getenv("SESSIONS_ENABLED", "1").strip().lower() not in ("0", "false", "no")
SESSION_DURATION_MIN = max(1, min(60, int(os.getenv("SESSION_DURATION_MIN", "15") or "15")))
ACTION_TIMEOUT_SEC = 120
MAX_ACTION_OUTPUT = 65536
MAX_COMMAND_LEN = 2000
ALLOWED_COMMAND_ROOTS = frozenset(
    {"git", "npm", "npx", "py", "python", "pip", "node", "cargo", "uvicorn"}
)
COMMAND_BLOCKED_SUBSTRINGS = (
    ";", "|", "&", "`", ">", "<", "$(", "${",
    "powershell", "cmd.exe", "cmd /c", " del ", " rm ", " rmdir ",
    "curl ", "wget ", "invoke-restmethod", "invoke-expression",
    "start-process", "format ", "shutdown", "reboot",
)
READ_FILE_BLOCKED_EXT = {
    ".exe", ".dll", ".so", ".dylib", ".bin", ".zip", ".7z", ".rar",
    ".gz", ".tar", ".bz2", ".xz", ".msi", ".iso", ".db", ".sqlite",
    ".woff", ".woff2", ".ttf", ".otf", ".ico", ".pyc", ".pyo",
}

HUB_TOKEN = os.getenv("HUB_TOKEN", "").strip()
CURSOR_API_LOCALHOST_ONLY = os.getenv("CURSOR_API_LOCALHOST_ONLY", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://127.0.0.1:8765,http://localhost:8765",
    ).split(",")
    if o.strip()
]

AGENTS = {
    "orchestrator": {"name": "Оркестратор", "role": "Координатор", "color": "#8b5cf6", "emoji": "🎯"},
    "designer": {"name": "Дизайнер", "role": "UI/UX", "color": "#ec4899", "emoji": "🎨"},
    "frontend": {"name": "Фронтенд", "role": "Alchemist", "color": "#06b6d4", "emoji": "⚡"},
    "backend": {"name": "Бэкенд", "role": "Engineer", "color": "#22c55e", "emoji": "🔧"},
    "owencloud": {"name": "OwenCloud", "role": "ПЛК/SCADA", "color": "#f59e0b", "emoji": "🏭"},
    "user": {"name": "Вы", "role": "Заказчик", "color": "#94a3b8", "emoji": "👤"},
    "system": {"name": "Система", "role": "Hub", "color": "#64748b", "emoji": "📡"},
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def check_hub_token(request: Request, *, required: bool = False) -> None:
    if not HUB_TOKEN:
        if required:
            raise HTTPException(
                status_code=503,
                detail="HUB_TOKEN not configured. Run launch-office.ps1 to generate .env",
            )
        return
    token = request.headers.get("X-Hub-Token") or request.query_params.get("token")
    if token != HUB_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid hub token")


def _is_local_request(request: Request) -> bool:
    host = (request.client.host if request.client else "") or ""
    if host in ("127.0.0.1", "::1", "localhost"):
        return True
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded.split(",")[0].strip() in ("127.0.0.1", "::1"):
        return True
    return False


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                agent TEXT NOT NULL,
                text TEXT NOT NULL,
                task_id TEXT,
                created_at TEXT NOT NULL,
                read_in_cursor INTEGER DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_status (
                agent TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                task TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent TEXT NOT NULL,
                text TEXT NOT NULL,
                options_json TEXT,
                image_url TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                answer_text TEXT,
                answer_option INTEGER,
                task_id TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent TEXT NOT NULL,
                chat_id INTEGER NOT NULL,
                command TEXT NOT NULL,
                reason TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                exit_code INTEGER,
                stdout TEXT,
                stderr TEXT,
                session_id INTEGER,
                created_at TEXT NOT NULL,
                resolved_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent TEXT NOT NULL,
                chat_id INTEGER NOT NULL,
                reason TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                started_at TEXT,
                expires_at TEXT,
                resolved_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                folder_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        try:
            conn.execute("ALTER TABLE messages ADD COLUMN attachments_json TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE messages ADD COLUMN chat_id INTEGER")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE agent_questions ADD COLUMN chat_id INTEGER")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE agent_actions ADD COLUMN session_id INTEGER")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE messages ADD COLUMN target_agent TEXT")
        except sqlite3.OperationalError:
            pass
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS read_cursors (
                chat_id INTEGER NOT NULL,
                thread_key TEXT NOT NULL,
                last_read_id INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (chat_id, thread_key)
            )
            """
        )

        count = conn.execute("SELECT COUNT(*) AS c FROM chats").fetchone()["c"]
        if count == 0:
            default_path = str(Path.home().resolve())
            now = utc_now()
            cur = conn.execute(
                """
                INSERT INTO chats (name, folder_path, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                ("Общий", default_path, now, now),
            )
            default_id = cur.lastrowid
            conn.execute("UPDATE messages SET chat_id = ? WHERE chat_id IS NULL", (default_id,))
            conn.execute(
                "UPDATE agent_questions SET chat_id = ? WHERE chat_id IS NULL",
                (default_id,),
            )

        for agent_id in AGENTS:
            if agent_id in ("user", "system"):
                continue
            conn.execute(
                """
                INSERT OR IGNORE INTO agent_status (agent, status, task, updated_at)
                VALUES (?, 'idle', NULL, ?)
                """,
                (agent_id, utc_now()),
            )


def append_bridge(path: Path, payload: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")


def validate_attachments(att: Optional[list[dict[str, str]]]) -> None:
    if att and len(att) > MAX_ATTACHMENTS_PER_MESSAGE:
        raise HTTPException(
            400,
            f"Max {MAX_ATTACHMENTS_PER_MESSAGE} attachments per message",
        )


ALLOW_CLIENT_FOLDER_PATHS = os.getenv("ALLOW_CLIENT_FOLDER_PATHS", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)


def _sanitize_folder_path_raw(raw: str) -> str:
    s = raw.strip()
    if not s:
        raise HTTPException(400, "folder_path required")
    if "\x00" in s:
        raise HTTPException(400, "Invalid folder path")
    if len(s) > 500:
        raise HTTPException(400, "folder_path too long")
    return s


def _looks_like_windows_path(s: str) -> bool:
    if len(s) >= 2 and s[1] == ":" and s[0].isalpha():
        return len(s) == 2 or s[2] in ("\\", "/")
    return s.startswith("\\\\")


def _looks_like_unix_path(s: str) -> bool:
    return s.startswith("/") and not s.startswith("//")


def _normalize_stored_folder_path(s: str) -> str:
    if _looks_like_windows_path(s):
        return s.replace("/", "\\")
    return s


def validate_folder_path(raw: str) -> str:
    """Accept paths that exist on this server, or client-side metadata paths for cloud."""
    s = _sanitize_folder_path_raw(raw)
    try:
        resolved = Path(s).expanduser().resolve()
        if resolved.is_dir():
            return str(resolved)
    except OSError:
        pass

    if not ALLOW_CLIENT_FOLDER_PATHS:
        raise HTTPException(400, "Folder does not exist")

    if _looks_like_windows_path(s):
        if os.name == "nt":
            raise HTTPException(400, "Folder does not exist")
        return _normalize_stored_folder_path(s)

    if _looks_like_unix_path(s):
        if os.name == "nt":
            raise HTTPException(400, "Folder does not exist")
        return s

    raise HTTPException(400, "Folder does not exist or invalid path format")


def row_to_chat(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "folder_path": row["folder_path"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_chat_row(chat_id: int) -> sqlite3.Row:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Chat not found")
    return row


def get_chat(chat_id: int) -> dict[str, Any]:
    return row_to_chat(get_chat_row(chat_id))


def get_default_chat_id() -> int:
    with get_db() as conn:
        row = conn.execute("SELECT id FROM chats ORDER BY id ASC LIMIT 1").fetchone()
    if not row:
        raise HTTPException(500, "No chats configured")
    return int(row["id"])


def resolve_chat_id(chat_id: Optional[int]) -> int:
    return chat_id if chat_id is not None else get_default_chat_id()


def chat_bridge_fields(chat_id: int) -> dict[str, Any]:
    chat = get_chat(chat_id)
    return {
        "chat_id": chat["id"],
        "chat_name": chat["name"],
        "folder_path": chat["folder_path"],
    }


def get_chat_workspace_root(chat_id: int) -> Path:
    chat = get_chat(chat_id)
    try:
        root = Path(chat["folder_path"]).expanduser().resolve()
    except OSError:
        root = Path(chat["folder_path"])
    if not root.is_dir():
        raise HTTPException(
            400,
            "Chat workspace folder missing on this server. "
            "Path is stored for Cursor on your PC.",
        )
    return root


def resolve_workspace_path(chat_id: int, relative: str = "") -> Path:
    root = get_chat_workspace_root(chat_id)
    rel = (relative or "").strip().replace("\\", "/").strip("/")
    if not rel or rel == ".":
        return root
    parts = [p for p in rel.split("/") if p and p != "."]
    if any(p == ".." for p in parts):
        raise HTTPException(403, "Path traversal not allowed")
    target = (root / Path(*parts)).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        raise HTTPException(403, "Path outside workspace")
    return target


def workspace_list_dir(chat_id: int, relative: str = "") -> dict[str, Any]:
    target = resolve_workspace_path(chat_id, relative)
    if not target.is_dir():
        raise HTTPException(400, "Not a directory")
    entries: list[dict[str, Any]] = []
    try:
        items = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError as exc:
        raise HTTPException(403, f"Cannot list directory: {exc}") from exc
    rel_display = "." if not relative or relative in (".", "/") else relative.replace("\\", "/")
    for item in items[:MAX_LIST_DIR_ENTRIES]:
        try:
            is_dir = item.is_dir()
            entry: dict[str, Any] = {
                "name": item.name,
                "type": "dir" if is_dir else "file",
            }
            if not is_dir:
                entry["size"] = item.stat().st_size
            entries.append(entry)
        except OSError:
            continue
    return {
        "chat_id": chat_id,
        "path": rel_display,
        "entries": entries,
        "truncated": len(items) > MAX_LIST_DIR_ENTRIES,
    }


def workspace_read_file(chat_id: int, relative: str) -> dict[str, Any]:
    if not relative or not relative.strip():
        raise HTTPException(400, "path query parameter required")
    target = resolve_workspace_path(chat_id, relative)
    if not target.is_file():
        raise HTTPException(400, "Not a file")
    ext = target.suffix.lower()
    if ext in READ_FILE_BLOCKED_EXT:
        raise HTTPException(400, f"File type not allowed for read: {ext}")
    try:
        size = target.stat().st_size
    except OSError as exc:
        raise HTTPException(403, str(exc)) from exc
    if size > MAX_READ_FILE_BYTES:
        raise HTTPException(400, f"File too large (max {MAX_READ_FILE_BYTES // 1024} KB)")
    try:
        data = target.read_bytes()
    except OSError as exc:
        raise HTTPException(403, str(exc)) from exc
    if b"\x00" in data[:8192]:
        raise HTTPException(400, "Binary file cannot be read as text")
    try:
        content = data.decode("utf-8")
        encoding = "utf-8"
    except UnicodeDecodeError:
        try:
            content = data.decode("cp1251")
            encoding = "cp1251"
        except UnicodeDecodeError:
            raise HTTPException(400, "File is not UTF-8 or CP1251 text")
    return {
        "chat_id": chat_id,
        "path": relative.replace("\\", "/"),
        "size": size,
        "encoding": encoding,
        "content": content,
    }


def workspace_git_status(chat_id: int) -> dict[str, Any]:
    root = get_chat_workspace_root(chat_id)
    git_dir = root / ".git"
    if not git_dir.exists():
        return {
            "chat_id": chat_id,
            "is_repo": False,
            "branch": None,
            "porcelain": "",
            "clean": True,
            "hint": "Not a git repository",
        }
    if not shutil.which("git"):
        return {
            "chat_id": chat_id,
            "is_repo": True,
            "branch": None,
            "porcelain": "",
            "clean": None,
            "error": "git not found in PATH",
        }
    try:
        branch_proc = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=GIT_STATUS_TIMEOUT_SEC,
        )
        status_proc = subprocess.run(
            ["git", "-C", str(root), "status", "--porcelain", "-b"],
            capture_output=True,
            text=True,
            timeout=GIT_STATUS_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(408, "git status timed out")
    if status_proc.returncode != 0:
        err = (status_proc.stderr or status_proc.stdout or "git status failed").strip()
        raise HTTPException(500, err)
    porcelain = status_proc.stdout or ""
    branch = (branch_proc.stdout or "").strip() if branch_proc.returncode == 0 else None
    lines = [ln for ln in porcelain.splitlines() if ln and not ln.startswith("##")]
    return {
        "chat_id": chat_id,
        "is_repo": True,
        "branch": branch,
        "porcelain": porcelain,
        "clean": len(lines) == 0,
        "changed_count": len(lines),
    }


def append_action_log(event: str, payload: dict[str, Any]) -> None:
    record = {"event": event, "time": utc_now(), **payload}
    append_bridge(ACTIONS_LOG, record)


def row_to_action(row: sqlite3.Row) -> dict[str, Any]:
    meta = AGENTS.get(row["agent"], AGENTS["system"])
    chat = get_chat(int(row["chat_id"]))
    keys = row.keys()
    out: dict[str, Any] = {
        "id": row["id"],
        "agent": row["agent"],
        "agent_name": meta["name"],
        "emoji": meta["emoji"],
        "color": meta["color"],
        "chat_id": row["chat_id"],
        "chat_name": chat["name"],
        "folder_path": chat["folder_path"],
        "command": row["command"],
        "reason": row["reason"],
        "status": row["status"],
        "exit_code": row["exit_code"],
        "stdout": row["stdout"],
        "stderr": row["stderr"],
        "created_at": row["created_at"],
        "resolved_at": row["resolved_at"],
    }
    if "session_id" in keys and row["session_id"] is not None:
        out["session_id"] = row["session_id"]
    return out


def session_seconds_left(expires_at: str) -> int:
    try:
        exp = datetime.fromisoformat(expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
    except ValueError:
        return 0
    now = datetime.now(timezone.utc)
    return max(0, int((exp - now).total_seconds()))


def row_to_session(row: sqlite3.Row) -> dict[str, Any]:
    meta = AGENTS.get(row["agent"], AGENTS["system"])
    chat = get_chat(int(row["chat_id"]))
    out: dict[str, Any] = {
        "id": row["id"],
        "agent": row["agent"],
        "agent_name": meta["name"],
        "emoji": meta["emoji"],
        "color": meta["color"],
        "chat_id": row["chat_id"],
        "chat_name": chat["name"],
        "folder_path": chat["folder_path"],
        "reason": row["reason"],
        "status": row["status"],
        "created_at": row["created_at"],
        "started_at": row["started_at"],
        "expires_at": row["expires_at"],
        "resolved_at": row["resolved_at"],
        "duration_min": SESSION_DURATION_MIN,
    }
    if row["expires_at"] and row["status"] == "active":
        out["seconds_left"] = session_seconds_left(row["expires_at"])
    return out


def expire_stale_sessions(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    now = utc_now()
    rows = conn.execute(
        """
        SELECT id, chat_id FROM agent_sessions
        WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?
        """,
        (now,),
    ).fetchall()
    expired: list[dict[str, Any]] = []
    for row in rows:
        conn.execute(
            "UPDATE agent_sessions SET status = 'expired', resolved_at = ? WHERE id = ?",
            (now, row["id"]),
        )
        append_action_log(
            "session_expired",
            {"id": row["id"], "chat_id": row["chat_id"]},
        )
        expired.append({"id": row["id"], "chat_id": row["chat_id"]})
    return expired


def has_pending_session(conn: sqlite3.Connection, chat_id: int) -> bool:
    row = conn.execute(
        "SELECT id FROM agent_sessions WHERE chat_id = ? AND status = 'pending' LIMIT 1",
        (chat_id,),
    ).fetchone()
    return row is not None


def has_active_session(conn: sqlite3.Connection, chat_id: int) -> bool:
    expire_stale_sessions(conn)
    row = conn.execute(
        "SELECT id FROM agent_sessions WHERE chat_id = ? AND status = 'active' LIMIT 1",
        (chat_id,),
    ).fetchone()
    return row is not None


def get_active_session(chat_id: int) -> Optional[dict[str, Any]]:
    cid = resolve_chat_id(chat_id)
    with get_db() as conn:
        expire_stale_sessions(conn)
        row = conn.execute(
            """
            SELECT * FROM agent_sessions
            WHERE chat_id = ? AND status = 'active'
            ORDER BY id DESC LIMIT 1
            """,
            (cid,),
        ).fetchone()
    return row_to_session(row) if row else None


def ensure_no_session_conflict(chat_id: int) -> None:
    with get_db() as conn:
        if has_pending_session(conn, chat_id):
            raise HTTPException(409, "A session approval is already pending for this chat")
        if has_active_session(conn, chat_id):
            raise HTTPException(409, "An active session already exists for this chat")
        if has_pending_action(chat_id):
            raise HTTPException(409, "A command approval is pending — resolve it first")


def create_session_proposal(agent: str, chat_id: Optional[int], reason: Optional[str]) -> dict[str, Any]:
    if not SESSIONS_ENABLED:
        raise HTTPException(503, "Sessions disabled (SESSIONS_ENABLED=0)")
    if agent not in AGENTS or agent in ("system",):
        raise HTTPException(400, "Unknown agent")
    cid = resolve_chat_id(chat_id)
    if has_pending_action(cid):
        raise HTTPException(409, "A command approval is pending — resolve it first")
    with get_db() as conn:
        if has_pending_session(conn, cid) or has_active_session(conn, cid):
            raise HTTPException(409, "Session already pending or active for this chat")
        now = utc_now()
        cur = conn.execute(
            """
            INSERT INTO agent_sessions (agent, chat_id, reason, status, created_at)
            VALUES (?, ?, ?, 'pending', ?)
            """,
            (agent, cid, (reason or "").strip() or None, now),
        )
        row = conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (cur.lastrowid,)).fetchone()
    session = row_to_session(row)
    append_action_log(
        "session_proposed",
        {"id": session["id"], "agent": agent, "chat_id": cid, "reason": session["reason"]},
    )
    return session


def activate_session_record(session_id: int) -> dict[str, Any]:
    now = utc_now()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=SESSION_DURATION_MIN)).isoformat()
    with get_db() as conn:
        row = conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Session not found")
        if row["status"] != "pending":
            raise HTTPException(400, f"Session already {row['status']}")
        if has_active_session(conn, int(row["chat_id"])):
            raise HTTPException(409, "Another active session exists for this chat")
        conn.execute(
            """
            UPDATE agent_sessions SET status = 'active', started_at = ?, expires_at = ?, resolved_at = NULL
            WHERE id = ?
            """,
            (now, expires, session_id),
        )
        updated = conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (session_id,)).fetchone()
    session = row_to_session(updated)
    append_action_log(
        "session_started",
        {"id": session_id, "chat_id": session["chat_id"], "agent": session["agent"], "expires_at": expires},
    )
    return session


def start_user_session(chat_id: int, reason: Optional[str] = None) -> dict[str, Any]:
    if not SESSIONS_ENABLED:
        raise HTTPException(503, "Sessions disabled (SESSIONS_ENABLED=0)")
    cid = resolve_chat_id(chat_id)
    get_chat_row(cid)
    if has_pending_action(cid):
        raise HTTPException(409, "A command approval is pending — resolve it first")
    with get_db() as conn:
        expire_stale_sessions(conn)
        if has_pending_session(conn, cid) or has_active_session(conn, cid):
            raise HTTPException(409, "Session already pending or active for this chat")
        now = utc_now()
        expires = (datetime.now(timezone.utc) + timedelta(minutes=SESSION_DURATION_MIN)).isoformat()
        cur = conn.execute(
            """
            INSERT INTO agent_sessions (agent, chat_id, reason, status, created_at, started_at, expires_at)
            VALUES ('user', ?, ?, 'active', ?, ?, ?)
            """,
            (cid, (reason or "").strip() or "Сессия запущена из UI", now, now, expires),
        )
        row = conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (cur.lastrowid,)).fetchone()
    session = row_to_session(row)
    append_action_log(
        "session_started",
        {"id": session["id"], "chat_id": cid, "agent": "user", "expires_at": expires},
    )
    return session


def revoke_session_record(session_id: int) -> dict[str, Any]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Session not found")
        if row["status"] not in ("pending", "active"):
            raise HTTPException(400, f"Session already {row['status']}")
        now = utc_now()
        new_status = "revoked"
        conn.execute(
            "UPDATE agent_sessions SET status = ?, resolved_at = ? WHERE id = ?",
            (new_status, now, session_id),
        )
        updated = conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (session_id,)).fetchone()
    session = row_to_session(updated)
    append_action_log(
        "session_revoked",
        {"id": session_id, "chat_id": session["chat_id"], "agent": session["agent"]},
    )
    return session


def validate_command(command: str) -> list[str]:
    cmd = command.strip()
    if not cmd:
        raise HTTPException(400, "Command required")
    if len(cmd) > MAX_COMMAND_LEN:
        raise HTTPException(400, f"Command too long (max {MAX_COMMAND_LEN})")
    lower = cmd.lower()
    for bad in COMMAND_BLOCKED_SUBSTRINGS:
        if bad in lower:
            raise HTTPException(400, f"Forbidden pattern in command: {bad.strip()}")
    try:
        parts = shlex.split(cmd, posix=(os.name != "nt"))
    except ValueError as exc:
        raise HTTPException(400, f"Invalid command syntax: {exc}") from exc
    if not parts:
        raise HTTPException(400, "Empty command")
    root = Path(parts[0]).stem.lower()
    if root not in ALLOWED_COMMAND_ROOTS:
        raise HTTPException(400, f"Command not allowed: {parts[0]}")
    exe = shutil.which(parts[0])
    if not exe:
        raise HTTPException(400, f"Command not found in PATH: {parts[0]}")
    return [exe, *parts[1:]]


def has_pending_action(chat_id: int) -> bool:
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM agent_actions WHERE chat_id = ? AND status = 'pending' LIMIT 1",
            (chat_id,),
        ).fetchone()
    return row is not None


def create_action(agent: str, chat_id: int, command: str, reason: Optional[str]) -> dict[str, Any]:
    if not ACTIONS_ENABLED:
        raise HTTPException(503, "Actions disabled (ACTIONS_ENABLED=0)")
    if agent not in AGENTS or agent in ("user", "system"):
        raise HTTPException(400, "Unknown agent")
    cid = resolve_chat_id(chat_id)
    validate_command(command)
    if has_pending_action(cid):
        raise HTTPException(409, "Another action is already pending for this chat")
    now = utc_now()
    with get_db() as conn:
        if has_pending_session(conn, cid):
            raise HTTPException(409, "A session approval is pending — resolve it first")
        cur = conn.execute(
            """
            INSERT INTO agent_actions (agent, chat_id, command, reason, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', ?)
            """,
            (agent, cid, command.strip(), (reason or "").strip() or None, now),
        )
        row = conn.execute("SELECT * FROM agent_actions WHERE id = ?", (cur.lastrowid,)).fetchone()
    action = row_to_action(row)
    append_action_log(
        "proposed",
        {"id": action["id"], "agent": agent, "chat_id": cid, "command": command.strip()},
    )
    return action


def truncate_output(text: Optional[str]) -> Optional[str]:
    if text is None:
        return None
    if len(text) <= MAX_ACTION_OUTPUT:
        return text
    return text[:MAX_ACTION_OUTPUT] + "\n... [truncated]"


def run_action_command(chat_id: int, command: str) -> tuple[int, str, str]:
    argv = validate_command(command)
    root = get_chat_workspace_root(chat_id)
    try:
        proc = subprocess.run(
            argv,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=ACTION_TIMEOUT_SEC,
            shell=False,
        )
        return proc.returncode, proc.stdout or "", proc.stderr or ""
    except subprocess.TimeoutExpired:
        return -1, "", f"Command timed out after {ACTION_TIMEOUT_SEC}s"


def try_open_folder(path: str) -> dict[str, Any]:
    candidates: list[tuple[list[str], str]] = []
    if shutil.which("cursor"):
        candidates.append((["cursor", path], "cursor"))
    if shutil.which("code"):
        candidates.append((["code", path], "code"))
    if os.name == "nt":
        candidates.append((["explorer", path], "explorer"))
    for cmd, name in candidates:
        try:
            subprocess.Popen(cmd, shell=False)
            return {"opened_with": name, "hint": f"Opened with {name}: {path}"}
        except OSError:
            continue
    if os.name == "nt":
        try:
            os.startfile(path)  # type: ignore[attr-defined]
            return {"opened_with": "explorer", "hint": f"Opened in Explorer: {path}"}
        except OSError:
            pass
    return {
        "opened_with": None,
        "hint": f"Open manually in Cursor: {path}",
    }


def _parse_json_col(raw: Any, default: Any) -> Any:
    if raw is None or raw == "":
        return default
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default


def thread_key(target_agent: Optional[str]) -> str:
    return target_agent if target_agent else "team"


def _thread_message_filter(target_agent: Optional[str]) -> tuple[str, tuple[Any, ...]]:
    if target_agent:
        return "target_agent = ?", (target_agent,)
    return "target_agent IS NULL", ()


def _effective_last_read_id(conn: sqlite3.Connection, chat_id: int, tk: str) -> int:
    row = conn.execute(
        "SELECT last_read_id FROM read_cursors WHERE chat_id = ? AND thread_key = ?",
        (chat_id, tk),
    ).fetchone()
    if row:
        return int(row["last_read_id"])
    target_agent = tk if tk != "team" else None
    filt, params = _thread_message_filter(target_agent)
    max_row = conn.execute(
        f"SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE chat_id = ? AND {filt}",
        (chat_id, *params),
    ).fetchone()
    return int(max_row["m"])


def count_thread_unread(conn: sqlite3.Connection, chat_id: int, tk: str) -> int:
    target_agent = tk if tk != "team" else None
    filt, params = _thread_message_filter(target_agent)
    last_read = _effective_last_read_id(conn, chat_id, tk)
    row = conn.execute(
        f"""
        SELECT COUNT(*) AS c FROM messages
        WHERE chat_id = ? AND {filt} AND id > ?
        """,
        (chat_id, *params, last_read),
    ).fetchone()
    return int(row["c"])


def mark_thread_read(chat_id: int, target_agent: Optional[str]) -> dict[str, Any]:
    tk = thread_key(target_agent)
    filt, params = _thread_message_filter(target_agent)
    now = utc_now()
    with get_db() as conn:
        max_row = conn.execute(
            f"SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE chat_id = ? AND {filt}",
            (chat_id, *params),
        ).fetchone()
        last_id = int(max_row["m"])
        conn.execute(
            """
            INSERT INTO read_cursors (chat_id, thread_key, last_read_id, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(chat_id, thread_key) DO UPDATE SET
                last_read_id = excluded.last_read_id,
                updated_at = excluded.updated_at
            """,
            (chat_id, tk, last_id, now),
        )
    return {"chat_id": chat_id, "thread_key": tk, "last_read_id": last_id}


def build_unread_snapshot() -> dict[str, Any]:
    by_chat: dict[str, Any] = {}
    with get_db() as conn:
        chat_rows = conn.execute("SELECT id FROM chats ORDER BY id ASC").fetchall()
        for chat_row in chat_rows:
            cid = int(chat_row["id"])
            team = count_thread_unread(conn, cid, "team")
            agents: dict[str, int] = {}
            agents_total = 0
            for agent_id in WORK_AGENTS:
                n = count_thread_unread(conn, cid, agent_id)
                agents[agent_id] = n
                agents_total += n
            by_chat[str(cid)] = {
                "team": team,
                "agents": agents,
                "total": team + agents_total,
            }
    return {"by_chat": by_chat}


def row_to_message(row: sqlite3.Row) -> dict[str, Any]:
    meta = AGENTS.get(row["agent"], AGENTS["system"])
    keys = row.keys()
    attachments = _parse_json_col(row["attachments_json"] if "attachments_json" in keys else None, [])
    out: dict[str, Any] = {
        "id": row["id"],
        "source": row["source"],
        "agent": row["agent"],
        "agent_name": meta["name"],
        "agent_role": meta["role"],
        "color": meta["color"],
        "emoji": meta["emoji"],
        "text": row["text"],
        "task_id": row["task_id"],
        "created_at": row["created_at"],
        "read_in_cursor": bool(row["read_in_cursor"]),
        "attachments": attachments,
    }
    if "chat_id" in keys and row["chat_id"] is not None:
        out["chat_id"] = row["chat_id"]
    if "chat_name" in keys and row["chat_name"] is not None:
        out["chat_name"] = row["chat_name"]
    if "folder_path" in keys and row["folder_path"] is not None:
        out["folder_path"] = row["folder_path"]
    if "target_agent" in keys and row["target_agent"] is not None:
        out["target_agent"] = row["target_agent"]
    return out


def row_to_question(row: sqlite3.Row) -> dict[str, Any]:
    meta = AGENTS.get(row["agent"], AGENTS["system"])
    keys = row.keys()
    out: dict[str, Any] = {
        "id": row["id"],
        "agent": row["agent"],
        "agent_name": meta["name"],
        "emoji": meta["emoji"],
        "color": meta["color"],
        "text": row["text"],
        "options": _parse_json_col(row["options_json"], None),
        "image_url": row["image_url"],
        "status": row["status"],
        "answer_text": row["answer_text"],
        "answer_option": row["answer_option"],
        "task_id": row["task_id"],
        "created_at": row["created_at"],
    }
    if "chat_id" in keys and row["chat_id"] is not None:
        out["chat_id"] = row["chat_id"]
    return out


class AttachmentRef(BaseModel):
    url: str
    name: str = "image"


class PostMessage(BaseModel):
    text: str = Field(default="", max_length=8000)
    agent: str = "user"
    source: str = "office"
    task_id: Optional[str] = None
    chat_id: Optional[int] = None
    target_agent: Optional[str] = None
    attachments: Optional[list[AttachmentRef]] = None


class AgentTask(BaseModel):
    text: str = Field(default="", max_length=8000)
    source: str = "office"
    chat_id: Optional[int] = None
    attachments: Optional[list[AttachmentRef]] = None


class CreateQuestion(BaseModel):
    agent: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=4000)
    options: Optional[list[str]] = None
    image_url: Optional[str] = None
    task_id: Optional[str] = None
    chat_id: Optional[int] = None


class CreateChat(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    folder_path: str = Field(min_length=1, max_length=500)


class UpdateChat(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    folder_path: Optional[str] = Field(default=None, min_length=1, max_length=500)


class MarkRead(BaseModel):
    chat_id: Optional[int] = None
    target_agent: Optional[str] = None


class AnswerQuestion(BaseModel):
    option_index: Optional[int] = None
    text: Optional[str] = None


class ProposeAction(BaseModel):
    agent: str = Field(min_length=1)
    command: str = Field(min_length=1, max_length=MAX_COMMAND_LEN)
    reason: Optional[str] = Field(default=None, max_length=500)
    chat_id: Optional[int] = None


class ProposeSession(BaseModel):
    agent: str = Field(min_length=1)
    reason: Optional[str] = Field(default=None, max_length=500)
    chat_id: Optional[int] = None


class ToolInvoke(BaseModel):
    tool: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)
    agent: str = "backend"
    chat_id: Optional[int] = None


class StatusUpdate(BaseModel):
    status: str = Field(pattern="^(idle|thinking|working|talking|done)$")
    task: Optional[str] = None


class TeamSummon(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    source: str = "office"
    chat_id: Optional[int] = None


app = FastAPI(title="Team Office Hub")
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_and_cache_middleware(request: Request, call_next):
    if (
        HUB_TOKEN
        and request.method in ("POST", "PUT", "PATCH", "DELETE")
        and request.url.path.startswith("/api/")
        and request.url.path != "/api/health"
    ):
        try:
            check_hub_token(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


@app.middleware("http")
async def cursor_api_guard(request: Request, call_next):
    if request.url.path.startswith("/api/cursor/"):
        if CURSOR_API_LOCALHOST_ONLY and not _is_local_request(request):
            return JSONResponse(
                status_code=403,
                content={"detail": "Cursor API is localhost-only"},
            )
        try:
            check_hub_token(request, required=True)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


connections: list[WebSocket] = []


async def broadcast(event: dict[str, Any]) -> None:
    dead: list[WebSocket] = []
    for ws in connections:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in connections:
            connections.remove(ws)


WORK_AGENTS = frozenset({"orchestrator", "designer", "frontend", "backend", "owencloud"})


def insert_message(
    source: str,
    agent: str,
    text: str,
    task_id: Optional[str] = None,
    attachments: Optional[list[dict[str, str]]] = None,
    chat_id: Optional[int] = None,
    target_agent: Optional[str] = None,
) -> dict[str, Any]:
    cid = resolve_chat_id(chat_id)
    if target_agent is not None and target_agent not in WORK_AGENTS:
        raise HTTPException(400, "Invalid target_agent")
    att_json = json.dumps(attachments, ensure_ascii=False) if attachments else None
    display_text = text.strip() or (f"📎 {len(attachments)} фото" if attachments else "")
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO messages (source, agent, text, task_id, created_at, attachments_json, chat_id, target_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (source, agent, display_text, task_id, utc_now(), att_json, cid, target_agent),
        )
        row = conn.execute(
            """
            SELECT m.*, c.name AS chat_name, c.folder_path
            FROM messages m
            LEFT JOIN chats c ON m.chat_id = c.id
            WHERE m.id = ?
            """,
            (cur.lastrowid,),
        ).fetchone()
    return row_to_message(row)


def create_question(
    agent: str,
    text: str,
    options: Optional[list[str]] = None,
    image_url: Optional[str] = None,
    task_id: Optional[str] = None,
    chat_id: Optional[int] = None,
) -> dict[str, Any]:
    cid = resolve_chat_id(chat_id)
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO agent_questions
                (agent, text, options_json, image_url, status, task_id, created_at, chat_id)
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
            """,
            (
                agent,
                text,
                json.dumps(options, ensure_ascii=False) if options else None,
                image_url,
                task_id,
                utc_now(),
                cid,
            ),
        )
        row = conn.execute("SELECT * FROM agent_questions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return row_to_question(row)


def set_agent_status(agent: str, status: str, task: Optional[str] = None) -> dict[str, Any]:
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO agent_status (agent, status, task, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(agent) DO UPDATE SET
                status = excluded.status,
                task = excluded.task,
                updated_at = excluded.updated_at
            """,
            (agent, status, task, utc_now()),
        )
        row = conn.execute("SELECT * FROM agent_status WHERE agent = ?", (agent,)).fetchone()
    meta = AGENTS.get(agent, AGENTS["system"])
    return {
        "agent": agent,
        "status": row["status"],
        "task": row["task"],
        "updated_at": row["updated_at"],
        "name": meta["name"],
        "color": meta["color"],
        "emoji": meta["emoji"],
    }


def get_lan_addresses() -> list[str]:
    ips: list[str] = []
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        ips.append(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addr = info[4][0]
            if not addr.startswith("127.") and addr not in ips:
                ips.append(addr)
    except OSError:
        pass
    return ips


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "time": utc_now(),
        "data_dir": str(DATA_DIR),
        "auth": bool(HUB_TOKEN),
        "client_folder_paths": ALLOW_CLIENT_FOLDER_PATHS,
        "folder_picker": os.name == "nt",
    }


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/info")
async def server_info(request: Request) -> dict[str, Any]:
    port = request.url.port or int(os.getenv("PORT", "8765"))
    urls = [{"label": "Этот компьютер", "url": f"http://127.0.0.1:{port}"}]
    for ip in get_lan_addresses():
        urls.append({"label": "Телефон (Wi‑Fi)", "url": f"http://{ip}:{port}"})
    return {
        "port": port,
        "urls": urls,
        "bridge": str(BRIDGE_DIR),
        "data_dir": str(DATA_DIR),
        "cloud_ready": True,
        "client_folder_paths": ALLOW_CLIENT_FOLDER_PATHS,
        "folder_picker": os.name == "nt",
    }


@app.get("/api/agents")
async def list_agents() -> dict[str, Any]:
    return {"agents": AGENTS}


@app.get("/api/status")
async def all_status() -> dict[str, Any]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM agent_status ORDER BY agent").fetchall()
    return {
        "statuses": [
            {
                "agent": r["agent"],
                "status": r["status"],
                "task": r["task"],
                "updated_at": r["updated_at"],
                "name": AGENTS.get(r["agent"], AGENTS["system"])["name"],
                "color": AGENTS.get(r["agent"], AGENTS["system"])["color"],
                "emoji": AGENTS.get(r["agent"], AGENTS["system"])["emoji"],
            }
            for r in rows
        ]
    }


@app.get("/api/chats")
async def list_chats() -> dict[str, Any]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM chats ORDER BY id ASC").fetchall()
    return {"chats": [row_to_chat(r) for r in rows]}


@app.post("/api/chats")
async def create_chat(body: CreateChat) -> dict[str, Any]:
    folder = validate_folder_path(body.folder_path)
    now = utc_now()
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO chats (name, folder_path, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (body.name.strip(), folder, now, now),
        )
        row = conn.execute("SELECT * FROM chats WHERE id = ?", (cur.lastrowid,)).fetchone()
    chat = row_to_chat(row)
    return {"ok": True, "chat": chat}


@app.patch("/api/chats/{chat_id}")
async def update_chat(chat_id: int, body: UpdateChat) -> dict[str, Any]:
    get_chat_row(chat_id)
    fields: list[str] = []
    values: list[Any] = []
    if body.name is not None:
        fields.append("name = ?")
        values.append(body.name.strip())
    if body.folder_path is not None:
        fields.append("folder_path = ?")
        values.append(validate_folder_path(body.folder_path))
    if not fields:
        raise HTTPException(400, "Nothing to update")
    fields.append("updated_at = ?")
    values.append(utc_now())
    values.append(chat_id)
    with get_db() as conn:
        conn.execute(f"UPDATE chats SET {', '.join(fields)} WHERE id = ?", values)
        row = conn.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
    return {"ok": True, "chat": row_to_chat(row)}


@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: int) -> dict[str, Any]:
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) AS c FROM chats").fetchone()["c"]
        if total <= 1:
            raise HTTPException(400, "Cannot delete the last chat")
        row = conn.execute("SELECT id FROM chats WHERE id = ?", (chat_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Chat not found")
        conn.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
        conn.execute("DELETE FROM agent_questions WHERE chat_id = ?", (chat_id,))
        conn.execute("DELETE FROM agent_actions WHERE chat_id = ?", (chat_id,))
        conn.execute("DELETE FROM agent_sessions WHERE chat_id = ?", (chat_id,))
        conn.execute("DELETE FROM read_cursors WHERE chat_id = ?", (chat_id,))
        conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
    return {"ok": True}


@app.post("/api/chats/{chat_id}/open-folder")
async def open_chat_folder(chat_id: int) -> dict[str, Any]:
    chat = get_chat(chat_id)
    result = try_open_folder(chat["folder_path"])
    return {"ok": True, "chat_id": chat_id, **result}


@app.get("/api/chats/{chat_id}/workspace/list")
async def chat_workspace_list(chat_id: int, path: str = "") -> dict[str, Any]:
    get_chat_row(chat_id)
    return {"ok": True, **workspace_list_dir(chat_id, path)}


@app.get("/api/chats/{chat_id}/workspace/read")
async def chat_workspace_read(chat_id: int, path: str) -> dict[str, Any]:
    get_chat_row(chat_id)
    return {"ok": True, **workspace_read_file(chat_id, path)}


@app.get("/api/chats/{chat_id}/workspace/git-status")
async def chat_workspace_git_status(chat_id: int) -> dict[str, Any]:
    get_chat_row(chat_id)
    return {"ok": True, **workspace_git_status(chat_id)}


@app.get("/api/cursor/workspace/list")
async def cursor_workspace_list(chat_id: int, path: str = "") -> dict[str, Any]:
    get_chat_row(chat_id)
    return {"ok": True, **workspace_list_dir(chat_id, path)}


@app.get("/api/cursor/workspace/read")
async def cursor_workspace_read(chat_id: int, path: str) -> dict[str, Any]:
    get_chat_row(chat_id)
    return {"ok": True, **workspace_read_file(chat_id, path)}


@app.get("/api/cursor/workspace/git-status")
async def cursor_workspace_git_status(chat_id: int) -> dict[str, Any]:
    get_chat_row(chat_id)
    return {"ok": True, **workspace_git_status(chat_id)}


@app.post("/api/pick-folder")
async def pick_folder(request: Request) -> dict[str, Any]:
    if not _is_local_request(request):
        raise HTTPException(
            501,
            "Folder picker is only available on localhost. Enter path manually.",
        )
    if os.name != "nt":
        raise HTTPException(501, "Folder picker is only available on Windows.")
    script = ROOT / "pick-folder.ps1"
    if not script.is_file():
        raise HTTPException(500, "pick-folder.ps1 not found")
    try:
        proc = subprocess.run(
            [
                "powershell",
                "-STA",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script),
            ],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(ROOT),
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(408, "Folder picker timed out")
    if proc.returncode != 0 and proc.stderr:
        err = proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else "Picker failed"
        raise HTTPException(500, err)
    path = (proc.stdout or "").strip()
    if not path:
        return {"ok": False, "cancelled": True, "path": None, "error": None}
    try:
        folder = validate_folder_path(path)
    except HTTPException as exc:
        raise HTTPException(400, str(exc.detail))
    return {"ok": True, "cancelled": False, "path": folder, "error": None}


@app.get("/api/messages")
async def get_messages(
    chat_id: Optional[int] = None,
    limit: int = 80,
    target_agent: Optional[str] = None,
    channel: Optional[str] = None,
) -> dict[str, Any]:
    cid = resolve_chat_id(chat_id)
    lim = min(limit, 200)
    with get_db() as conn:
        if target_agent:
            if target_agent not in WORK_AGENTS:
                raise HTTPException(400, "Unknown agent")
            rows = conn.execute(
                """
                SELECT m.*, c.name AS chat_name, c.folder_path
                FROM messages m
                LEFT JOIN chats c ON m.chat_id = c.id
                WHERE m.chat_id = ? AND m.target_agent = ?
                ORDER BY m.id DESC
                LIMIT ?
                """,
                (cid, target_agent, lim),
            ).fetchall()
        elif channel == "team":
            rows = conn.execute(
                """
                SELECT m.*, c.name AS chat_name, c.folder_path
                FROM messages m
                LEFT JOIN chats c ON m.chat_id = c.id
                WHERE m.chat_id = ? AND m.target_agent IS NULL
                ORDER BY m.id DESC
                LIMIT ?
                """,
                (cid, lim),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT m.*, c.name AS chat_name, c.folder_path
                FROM messages m
                LEFT JOIN chats c ON m.chat_id = c.id
                WHERE m.chat_id = ?
                ORDER BY m.id DESC
                LIMIT ?
                """,
                (cid, lim),
            ).fetchall()
    return {
        "messages": [row_to_message(r) for r in reversed(rows)],
        "chat_id": cid,
        "target_agent": target_agent,
        "channel": channel or ("agent" if target_agent else "all"),
    }


@app.get("/api/unread")
async def get_unread() -> dict[str, Any]:
    return build_unread_snapshot()


@app.post("/api/read")
async def post_mark_read(body: MarkRead) -> dict[str, Any]:
    cid = resolve_chat_id(body.chat_id)
    if body.target_agent is not None and body.target_agent not in WORK_AGENTS:
        raise HTTPException(400, "Unknown agent")
    cursor = mark_thread_read(cid, body.target_agent)
    unread = build_unread_snapshot()
    return {"ok": True, "cursor": cursor, **unread}


@app.post("/api/uploads")
async def upload_image(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(400, "No filename")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(400, f"Allowed: {', '.join(ALLOWED_IMAGE_EXT)}")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "Max 5 MB")
    file_id = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOADS_DIR / file_id
    dest.write_bytes(data)
    return {"ok": True, "url": f"/api/uploads/{file_id}", "name": file.filename}


@app.get("/api/uploads/{file_id}")
async def get_upload(file_id: str) -> FileResponse:
    safe = Path(file_id).name
    path = UPLOADS_DIR / safe
    if not path.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(path)


@app.get("/api/questions/pending")
async def pending_question(chat_id: Optional[int] = None) -> dict[str, Any]:
    cid = resolve_chat_id(chat_id)
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT * FROM agent_questions
            WHERE status = 'pending' AND chat_id = ?
            ORDER BY id ASC LIMIT 1
            """,
            (cid,),
        ).fetchone()
    return {"question": row_to_question(row) if row else None, "chat_id": cid}


@app.post("/api/questions")
async def post_question(body: CreateQuestion) -> dict[str, Any]:
    if body.agent not in AGENTS or body.agent in ("user", "system"):
        raise HTTPException(400, "Unknown agent")
    q = create_question(
        body.agent,
        body.text,
        body.options,
        body.image_url,
        body.task_id,
        body.chat_id,
    )
    st = set_agent_status(body.agent, "talking", body.text[:200])
    await broadcast({"type": "status", "data": st})
    await broadcast({"type": "question", "data": q})
    return {"ok": True, "question": q}


@app.post("/api/cursor/inject-question")
async def cursor_inject_question(body: CreateQuestion) -> dict[str, Any]:
    return await post_question(body)


@app.post("/api/questions/{question_id}/answer")
async def answer_question(question_id: int, body: AnswerQuestion) -> dict[str, Any]:
    if body.option_index is None and not (body.text and body.text.strip()):
        raise HTTPException(400, "Provide option_index or text")
    with get_db() as conn:
        row = conn.execute("SELECT * FROM agent_questions WHERE id = ?", (question_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Question not found")
        if row["status"] != "pending":
            raise HTTPException(400, "Already answered")
        options = _parse_json_col(row["options_json"], None)
        answer_label = ""
        if body.option_index is not None and options:
            if body.option_index < 0 or body.option_index >= len(options):
                raise HTTPException(400, "Invalid option")
            answer_label = options[body.option_index]
        elif body.text:
            answer_label = body.text.strip()
        conn.execute(
            """
            UPDATE agent_questions SET
                status = 'answered',
                answer_text = ?,
                answer_option = ?
            WHERE id = ?
            """,
            (answer_label, body.option_index, question_id),
        )
        updated = conn.execute("SELECT * FROM agent_questions WHERE id = ?", (question_id,)).fetchone()
    q = row_to_question(updated)
    msg = insert_message(
        "office",
        "user",
        f"Ответ для {q['agent_name']}: {answer_label}",
        q.get("task_id"),
        chat_id=q.get("chat_id"),
    )
    await broadcast({"type": "message", "data": msg})
    await broadcast({"type": "question_answered", "data": q})
    st = set_agent_status(q["agent"], "idle", None)
    await broadcast({"type": "status", "data": st})
    return {"ok": True, "question": q, "message": msg}


@app.post("/api/questions/{question_id}/dismiss")
async def dismiss_question(question_id: int) -> dict[str, Any]:
    with get_db() as conn:
        conn.execute(
            "UPDATE agent_questions SET status = 'dismissed' WHERE id = ? AND status = 'pending'",
            (question_id,),
        )
    return {"ok": True}


async def execute_action(
    action_id: int,
    session_id: Optional[int] = None,
    audit_event: str = "approved",
) -> dict[str, Any]:
    if not ACTIONS_ENABLED:
        raise HTTPException(503, "Actions disabled (ACTIONS_ENABLED=0)")
    with get_db() as conn:
        row = conn.execute("SELECT * FROM agent_actions WHERE id = ?", (action_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Action not found")
        if row["status"] != "pending":
            raise HTTPException(400, f"Action already {row['status']}")
        now = utc_now()
        conn.execute(
            "UPDATE agent_actions SET status = 'running', resolved_at = ? WHERE id = ?",
            (now, action_id),
        )
        running_row = conn.execute("SELECT * FROM agent_actions WHERE id = ?", (action_id,)).fetchone()
    running = row_to_action(running_row)
    await broadcast({"type": "action_resolved", "data": running})

    exit_code, stdout, stderr = run_action_command(int(row["chat_id"]), row["command"])
    stdout = truncate_output(stdout) or ""
    stderr = truncate_output(stderr) or ""
    final_status = "completed" if exit_code == 0 else "failed"
    finished = utc_now()
    with get_db() as conn:
        conn.execute(
            """
            UPDATE agent_actions SET status = ?, exit_code = ?, stdout = ?, stderr = ?,
                resolved_at = ?, session_id = ? WHERE id = ?
            """,
            (final_status, exit_code, stdout, stderr, finished, session_id, action_id),
        )
        final_row = conn.execute("SELECT * FROM agent_actions WHERE id = ?", (action_id,)).fetchone()
    action = row_to_action(final_row)
    log_payload: dict[str, Any] = {
        "id": action_id,
        "chat_id": row["chat_id"],
        "agent": row["agent"],
        "command": row["command"],
        "exit_code": exit_code,
        "status": final_status,
    }
    if session_id is not None:
        log_payload["session_id"] = session_id
    append_action_log(audit_event, log_payload)
    summary = f"⚙️ Команда: `{row['command']}` — код {exit_code}."
    if stderr.strip():
        summary += f"\n```\n{stderr[:400]}\n```"
    elif stdout.strip():
        summary += f"\n```\n{stdout[:400]}\n```"
    msg = insert_message("office", "system", summary, chat_id=int(row["chat_id"]))
    st = set_agent_status(row["agent"], "idle", None)
    await broadcast({"type": "status", "data": st})
    await broadcast({"type": "message", "data": msg})
    await broadcast({"type": "action_resolved", "data": action})
    return {"ok": True, "action": action, "message": msg}


async def propose_action_flow(
    agent: str,
    chat_id: Optional[int],
    command: str,
    reason: Optional[str],
) -> dict[str, Any]:
    cid = resolve_chat_id(chat_id)
    session = get_active_session(cid)
    action = create_action(agent, chat_id, command, reason)
    st = set_agent_status(agent, "talking", command[:200])
    await broadcast({"type": "status", "data": st})
    if session:
        result = await execute_action(
            action["id"],
            session_id=session["id"],
            audit_event="auto_executed",
        )
        return {
            "ok": True,
            "action": result["action"],
            "auto_executed": True,
            "session_id": session["id"],
        }
    await broadcast({"type": "action_proposed", "data": action})
    return {"ok": True, "action": action}


@app.post("/api/cursor/actions/propose")
@app.post("/api/cursor/inject-action")
async def cursor_propose_action(body: ProposeAction) -> dict[str, Any]:
    return await propose_action_flow(body.agent, body.chat_id, body.command, body.reason)


@app.get("/api/actions/pending")
async def pending_action(chat_id: Optional[int] = None) -> dict[str, Any]:
    cid = resolve_chat_id(chat_id)
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT * FROM agent_actions
            WHERE status = 'pending' AND chat_id = ?
            ORDER BY id ASC LIMIT 1
            """,
            (cid,),
        ).fetchone()
    return {"action": row_to_action(row) if row else None, "chat_id": cid}


@app.get("/api/cursor/actions/{action_id}")
async def get_action(action_id: int) -> dict[str, Any]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM agent_actions WHERE id = ?", (action_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Action not found")
    return {"ok": True, "action": row_to_action(row)}


@app.post("/api/actions/{action_id}/approve")
async def approve_action(action_id: int) -> dict[str, Any]:
    return await execute_action(action_id, audit_event="approved")


@app.post("/api/actions/{action_id}/reject")
async def reject_action(action_id: int) -> dict[str, Any]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM agent_actions WHERE id = ?", (action_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Action not found")
        if row["status"] != "pending":
            raise HTTPException(400, f"Action already {row['status']}")
        now = utc_now()
        conn.execute(
            "UPDATE agent_actions SET status = 'rejected', resolved_at = ? WHERE id = ?",
            (now, action_id),
        )
        updated = conn.execute("SELECT * FROM agent_actions WHERE id = ?", (action_id,)).fetchone()
    action = row_to_action(updated)
    append_action_log(
        "rejected",
        {
            "id": action_id,
            "chat_id": row["chat_id"],
            "agent": row["agent"],
            "command": row["command"],
        },
    )
    st = set_agent_status(row["agent"], "idle", None)
    await broadcast({"type": "status", "data": st})
    await broadcast({"type": "action_resolved", "data": action})
    return {"ok": True, "action": action}


async def broadcast_session_expired(expired: list[dict[str, Any]]) -> None:
    for item in expired:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (item["id"],)).fetchone()
        if row:
            await broadcast({"type": "session_expired", "data": row_to_session(row)})


@app.get("/api/sessions/active")
async def active_session(chat_id: Optional[int] = None) -> dict[str, Any]:
    cid = resolve_chat_id(chat_id)
    with get_db() as conn:
        expired = expire_stale_sessions(conn)
    if expired:
        await broadcast_session_expired(expired)
    session = get_active_session(cid)
    return {"session": session, "chat_id": cid}


@app.get("/api/sessions/pending")
async def pending_session(chat_id: Optional[int] = None) -> dict[str, Any]:
    cid = resolve_chat_id(chat_id)
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT * FROM agent_sessions
            WHERE status = 'pending' AND chat_id = ?
            ORDER BY id ASC LIMIT 1
            """,
            (cid,),
        ).fetchone()
    return {"session": row_to_session(row) if row else None, "chat_id": cid}


@app.post("/api/chats/{chat_id}/session/start")
async def chat_start_session(chat_id: int) -> dict[str, Any]:
    session = start_user_session(chat_id)
    msg = insert_message(
        "office",
        "system",
        f"Сессия команд активна · {SESSION_DURATION_MIN} мин",
        chat_id=session["chat_id"],
    )
    await broadcast({"type": "session_started", "data": session})
    await broadcast({"type": "message", "data": msg})
    return {"ok": True, "session": session, "message": msg}


@app.post("/api/cursor/sessions/propose")
async def cursor_propose_session(body: ProposeSession) -> dict[str, Any]:
    session = create_session_proposal(body.agent, body.chat_id, body.reason)
    st = set_agent_status(body.agent, "talking", "Запрос сессии команд")
    await broadcast({"type": "status", "data": st})
    await broadcast({"type": "session_proposed", "data": session})
    return {"ok": True, "session": session}


@app.get("/api/cursor/sessions/{session_id}")
async def get_session(session_id: int) -> dict[str, Any]:
    with get_db() as conn:
        expire_stale_sessions(conn)
        row = conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (session_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    return {"ok": True, "session": row_to_session(row)}


@app.post("/api/sessions/{session_id}/approve")
async def approve_session(session_id: int) -> dict[str, Any]:
    session = activate_session_record(session_id)
    msg = insert_message(
        "office",
        "system",
        f"Сессия команд одобрена · {SESSION_DURATION_MIN} мин",
        chat_id=session["chat_id"],
    )
    st = set_agent_status(session["agent"], "idle", None)
    await broadcast({"type": "status", "data": st})
    await broadcast({"type": "session_started", "data": session})
    await broadcast({"type": "message", "data": msg})
    return {"ok": True, "session": session, "message": msg}


@app.post("/api/sessions/{session_id}/reject")
async def reject_session(session_id: int) -> dict[str, Any]:
    session = revoke_session_record(session_id)
    st = set_agent_status(session["agent"], "idle", None)
    await broadcast({"type": "status", "data": st})
    await broadcast({"type": "session_revoked", "data": session})
    return {"ok": True, "session": session}


@app.post("/api/sessions/{session_id}/revoke")
async def revoke_session(session_id: int) -> dict[str, Any]:
    session = revoke_session_record(session_id)
    msg = insert_message(
        "office",
        "system",
        "Сессия команд остановлена",
        chat_id=session["chat_id"],
    )
    if session["agent"] not in ("user", "system"):
        st = set_agent_status(session["agent"], "idle", None)
        await broadcast({"type": "status", "data": st})
    await broadcast({"type": "session_revoked", "data": session})
    await broadcast({"type": "message", "data": msg})
    return {"ok": True, "session": session, "message": msg}


@app.post("/api/messages")
async def post_message(body: PostMessage) -> dict[str, Any]:
    att = [a.model_dump() for a in body.attachments] if body.attachments else None
    validate_attachments(att)
    if not body.text.strip() and not att:
        raise HTTPException(400, "Text or attachments required")
    cid = resolve_chat_id(body.chat_id)
    msg = insert_message(
        body.source,
        body.agent,
        body.text,
        body.task_id,
        att,
        cid,
        body.target_agent,
    )
    if body.source == "office" and body.agent == "user":
        bridge_payload: dict[str, Any] = {
            "id": msg["id"],
            "text": body.text or msg["text"],
            "created_at": msg["created_at"],
            "task_id": body.task_id,
            "attachments": att or [],
            **chat_bridge_fields(cid),
        }
        if body.target_agent:
            bridge_payload["type"] = "agent_task"
            bridge_payload["target_agent"] = body.target_agent
        append_bridge(FROM_OFFICE, bridge_payload)
    await broadcast({"type": "message", "data": msg})
    return {"ok": True, "message": msg}


@app.post("/api/agents/{agent_id}/task")
async def post_agent_task(agent_id: str, body: AgentTask) -> dict[str, Any]:
    """Direct task to a single agent — personal thread in the active project chat."""
    if agent_id not in WORK_AGENTS:
        raise HTTPException(400, "Unknown agent")
    att = [a.model_dump() for a in body.attachments] if body.attachments else None
    validate_attachments(att)
    if not body.text.strip() and not att:
        raise HTTPException(400, "Text or attachments required")
    cid = resolve_chat_id(body.chat_id)
    task_id = str(uuid.uuid4())[:8]
    msg = insert_message(
        body.source,
        "user",
        body.text,
        task_id,
        att,
        cid,
        agent_id,
    )
    meta = AGENTS.get(agent_id, AGENTS["system"])
    append_bridge(
        FROM_OFFICE,
        {
            "id": msg["id"],
            "type": "agent_task",
            "target_agent": agent_id,
            "target_agent_name": meta["name"],
            "text": body.text or msg["text"],
            "created_at": msg["created_at"],
            "task_id": task_id,
            "attachments": att or [],
            **chat_bridge_fields(cid),
        },
    )
    st = set_agent_status(agent_id, "thinking", body.text[:200])
    await broadcast({"type": "status", "data": st})
    await broadcast({"type": "message", "data": msg})
    return {"ok": True, "task_id": task_id, "message": msg, "target_agent": agent_id}


@app.post("/api/team/summon")
async def summon_team(body: TeamSummon) -> dict[str, Any]:
    """User calls the team from office — queue for Cursor + show agent discussion."""
    cid = resolve_chat_id(body.chat_id)
    bridge_chat = chat_bridge_fields(cid)
    task_id = str(uuid.uuid4())[:8]
    user_msg = insert_message(body.source, "user", body.text, task_id, chat_id=cid)
    append_bridge(
        FROM_OFFICE,
        {
            "id": user_msg["id"],
            "text": body.text,
            "created_at": user_msg["created_at"],
            "task_id": task_id,
            "type": "team_summon",
            **bridge_chat,
        },
    )

    script = [
        ("orchestrator", "thinking", f"Принял задачу: «{body.text[:120]}»"),
        ("orchestrator", "talking", "Собираю команду. План — после вашего approval."),
        ("designer", "thinking", "Готовлю визуальную концепцию и user flows."),
        ("frontend", "thinking", "Проверяю MWDP: transitions, tokens, компоненты."),
        ("backend", "thinking", "Смотрю API spec и auth patterns."),
        ("system", "talking", "Запрос отправлен в Cursor. Напишите здесь: «проверь офис» или $team …"),
    ]

    messages = [user_msg]
    await broadcast(
        {
            "type": "team_summon",
            "task_id": task_id,
            "text": body.text,
            "chat_id": cid,
        }
    )

    import asyncio

    for agent, status, text in script:
        st = set_agent_status(agent, status, body.text[:200])
        await broadcast({"type": "status", "data": st})
        if text:
            m = insert_message("office-sim", agent, text, task_id, chat_id=cid)
            messages.append(m)
            await broadcast({"type": "message", "data": m})
        if agent != "system":
            await broadcast(
                {
                    "type": "status",
                    "data": set_agent_status(agent, "working", body.text[:200]),
                }
            )
        await asyncio.sleep(0.55)

    for agent, _, _ in script:
        if agent not in ("user", "system"):
            await broadcast({"type": "status", "data": set_agent_status(agent, "idle", None)})

    await asyncio.sleep(2.5)
    q = create_question(
        "designer",
        "Какой визуальный тон предпочитаете для этой задачи?",
        ["Светлый", "Средний", "Тёмный"],
        task_id=task_id,
        chat_id=cid,
    )
    st = set_agent_status("designer", "talking", "Уточняю у заказчика")
    await broadcast({"type": "status", "data": st})
    await broadcast({"type": "question", "data": q})

    return {"ok": True, "task_id": task_id, "messages": messages, "cursor_hint": "Проверьте bridge/from-office.jsonl"}


async def invoke_cursor_tool(
    tool: str,
    arguments: dict[str, Any],
    agent: str,
    chat_id: Optional[int],
) -> dict[str, Any]:
    if not cursor_tools.is_valid_tool(tool):
        raise HTTPException(400, f"Unknown tool: {tool}")
    args = arguments or {}
    cid = resolve_chat_id(args.get("chat_id", chat_id))

    if tool == "inbox_list":
        filter_cid = args.get("chat_id", chat_id)
        with get_db() as conn:
            if filter_cid is not None:
                rows = conn.execute(
                    """
                    SELECT m.*, c.name AS chat_name, c.folder_path
                    FROM messages m
                    LEFT JOIN chats c ON m.chat_id = c.id
                    WHERE m.source IN ('office', 'office-sim')
                      AND m.agent = 'user'
                      AND m.read_in_cursor = 0
                      AND m.chat_id = ?
                    ORDER BY m.id ASC
                    """,
                    (filter_cid,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT m.*, c.name AS chat_name, c.folder_path
                    FROM messages m
                    LEFT JOIN chats c ON m.chat_id = c.id
                    WHERE m.source IN ('office', 'office-sim')
                      AND m.agent = 'user'
                      AND m.read_in_cursor = 0
                    ORDER BY m.id ASC
                    """
                ).fetchall()
        return {"ok": True, "inbox": [row_to_message(r) for r in rows]}

    if tool == "inbox_mark_read":
        mid = args.get("message_id")
        if mid is None:
            raise HTTPException(400, "message_id required")
        with get_db() as conn:
            conn.execute("UPDATE messages SET read_in_cursor = 1 WHERE id = ?", (mid,))
        return {"ok": True}

    if tool == "inject_message":
        text = str(args.get("text", "")).strip()
        msg_agent = str(args.get("agent", agent))
        if not text:
            raise HTTPException(400, "text required")
        body = PostMessage(
            text=text,
            agent=msg_agent,
            chat_id=args.get("chat_id", chat_id),
            task_id=args.get("task_id"),
        )
        return await cursor_inject(body)

    if tool == "inject_question":
        text = str(args.get("text", "")).strip()
        q_agent = str(args.get("agent", agent))
        if not text:
            raise HTTPException(400, "text required")
        body = CreateQuestion(
            agent=q_agent,
            text=text,
            options=args.get("options"),
            task_id=args.get("task_id"),
            chat_id=args.get("chat_id", chat_id),
        )
        return await cursor_inject_question(body)

    if tool == "chats_list":
        with get_db() as conn:
            rows = conn.execute("SELECT * FROM chats ORDER BY id ASC").fetchall()
        return {"ok": True, "chats": [row_to_chat(r) for r in rows]}

    if tool == "workspace_list":
        target_cid = args.get("chat_id", chat_id)
        if target_cid is None:
            raise HTTPException(400, "chat_id required")
        get_chat_row(int(target_cid))
        return {"ok": True, **workspace_list_dir(int(target_cid), str(args.get("path", "")))}

    if tool == "workspace_read":
        target_cid = args.get("chat_id", chat_id)
        path = str(args.get("path", "")).strip()
        if target_cid is None or not path:
            raise HTTPException(400, "chat_id and path required")
        get_chat_row(int(target_cid))
        return {"ok": True, **workspace_read_file(int(target_cid), path)}

    if tool == "workspace_git_status":
        target_cid = args.get("chat_id", chat_id)
        if target_cid is None:
            raise HTTPException(400, "chat_id required")
        get_chat_row(int(target_cid))
        return {"ok": True, **workspace_git_status(int(target_cid))}

    if tool == "action_propose":
        cmd = str(args.get("command", "")).strip()
        act_agent = str(args.get("agent", agent))
        if not cmd:
            raise HTTPException(400, "command required")
        return await propose_action_flow(
            act_agent,
            args.get("chat_id", chat_id),
            cmd,
            args.get("reason"),
        )

    if tool == "action_status":
        action_id = args.get("action_id")
        if action_id is None:
            raise HTTPException(400, "action_id required")
        with get_db() as conn:
            row = conn.execute("SELECT * FROM agent_actions WHERE id = ?", (action_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Action not found")
        return {"ok": True, "action": row_to_action(row)}

    if tool == "session_propose":
        sess_agent = str(args.get("agent", agent))
        session = create_session_proposal(sess_agent, args.get("chat_id", chat_id), args.get("reason"))
        st = set_agent_status(sess_agent, "talking", "Запрос сессии команд")
        await broadcast({"type": "status", "data": st})
        await broadcast({"type": "session_proposed", "data": session})
        return {"ok": True, "session": session}

    if tool == "session_status":
        session_id = args.get("session_id")
        if session_id is None:
            raise HTTPException(400, "session_id required")
        with get_db() as conn:
            expire_stale_sessions(conn)
            row = conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Session not found")
        return {"ok": True, "session": row_to_session(row)}

    if tool == "session_active":
        target_cid = args.get("chat_id", chat_id)
        if target_cid is None:
            raise HTTPException(400, "chat_id required")
        session = get_active_session(int(target_cid))
        return {"ok": True, "session": session, "chat_id": int(target_cid)}

    raise HTTPException(400, f"Tool not implemented: {tool}")


@app.get("/api/cursor/tools")
async def cursor_list_tools() -> dict[str, Any]:
    return {"ok": True, "tools": cursor_tools.list_tools()}


@app.post("/api/cursor/tools/invoke")
async def cursor_invoke_tool(body: ToolInvoke) -> dict[str, Any]:
    result = await invoke_cursor_tool(body.tool, body.arguments, body.agent, body.chat_id)
    return {"ok": True, "tool": body.tool, "result": result}


@app.post("/api/cursor/inject")
async def cursor_inject(body: PostMessage) -> dict[str, Any]:
    """Messages from Cursor chat → appear in office."""
    att = [a.model_dump() for a in body.attachments] if body.attachments else None
    validate_attachments(att)
    cid = resolve_chat_id(body.chat_id)
    msg = insert_message(
        "cursor",
        body.agent,
        body.text,
        body.task_id,
        att,
        cid,
        body.target_agent,
    )
    bridge_payload: dict[str, Any] = {
        "id": msg["id"],
        "agent": body.agent,
        "text": body.text or msg["text"],
        "created_at": msg["created_at"],
        "task_id": body.task_id,
        "attachments": att or [],
        **chat_bridge_fields(cid),
    }
    if body.target_agent:
        bridge_payload["target_agent"] = body.target_agent
    append_bridge(FROM_CURSOR, bridge_payload)
    if body.agent in AGENTS and body.agent not in ("user", "system"):
        st = set_agent_status(body.agent, "talking", body.text[:200])
        await broadcast({"type": "status", "data": st})
    await broadcast({"type": "message", "data": msg})
    return {"ok": True, "message": msg}


@app.get("/api/cursor/inbox")
async def cursor_inbox(chat_id: Optional[int] = None) -> dict[str, Any]:
    """Unread messages from office for Cursor agent."""
    with get_db() as conn:
        if chat_id is not None:
            rows = conn.execute(
                """
                SELECT m.*, c.name AS chat_name, c.folder_path
                FROM messages m
                LEFT JOIN chats c ON m.chat_id = c.id
                WHERE m.source IN ('office', 'office-sim')
                  AND m.agent = 'user'
                  AND m.read_in_cursor = 0
                  AND m.chat_id = ?
                ORDER BY m.id ASC
                """,
                (chat_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT m.*, c.name AS chat_name, c.folder_path
                FROM messages m
                LEFT JOIN chats c ON m.chat_id = c.id
                WHERE m.source IN ('office', 'office-sim')
                  AND m.agent = 'user'
                  AND m.read_in_cursor = 0
                ORDER BY m.id ASC
                """
            ).fetchall()
    return {"inbox": [row_to_message(r) for r in rows]}


@app.post("/api/cursor/inbox/{message_id}/read")
async def mark_read(message_id: int) -> dict[str, bool]:
    with get_db() as conn:
        conn.execute("UPDATE messages SET read_in_cursor = 1 WHERE id = ?", (message_id,))
    return {"ok": True}


@app.patch("/api/agents/{agent_id}/status")
async def patch_status(agent_id: str, body: StatusUpdate) -> dict[str, Any]:
    st = set_agent_status(agent_id, body.status, body.task)
    await broadcast({"type": "status", "data": st})
    return {"ok": True, "status": st}


def _is_local_ws(ws: WebSocket) -> bool:
    host = (ws.client.host if ws.client else "") or ""
    return host in ("127.0.0.1", "::1", "localhost")


@app.get("/api/office/ws-token")
async def office_ws_token(request: Request) -> dict[str, Any]:
    """Token for WebSocket — office UI on localhost only (not for /api/cursor/*)."""
    if not _is_local_request(request):
        raise HTTPException(403, "localhost only")
    return {"token": HUB_TOKEN or None}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    if HUB_TOKEN and not _is_local_ws(ws):
        token = ws.query_params.get("token")
        if token != HUB_TOKEN:
            await ws.close(code=1008)
            return
    await ws.accept()
    connections.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in connections:
            connections.remove(ws)


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")