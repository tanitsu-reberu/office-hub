"""Cursor agent tool definitions for E4 tools API and MCP."""

from __future__ import annotations

from typing import Any

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "inbox_list",
        "description": "Unread messages from office UI for Cursor. Returns chat_id and folder_path per item.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "chat_id": {"type": "integer", "description": "Optional filter by chat"},
            },
        },
    },
    {
        "name": "inbox_mark_read",
        "description": "Mark an inbox message as read after processing.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "message_id": {"type": "integer"},
            },
            "required": ["message_id"],
        },
    },
    {
        "name": "inject_message",
        "description": "Send agent reply to office chat and 3D scene.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "agent": {"type": "string"},
                "chat_id": {"type": "integer"},
                "task_id": {"type": "string"},
            },
            "required": ["text", "agent"],
        },
    },
    {
        "name": "inject_question",
        "description": "Ask the user a question with optional multiple-choice options.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "agent": {"type": "string"},
                "chat_id": {"type": "integer"},
                "options": {"type": "array", "items": {"type": "string"}},
                "task_id": {"type": "string"},
            },
            "required": ["text", "agent"],
        },
    },
    {
        "name": "chats_list",
        "description": "List all office chats with folder_path bindings.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "workspace_list",
        "description": "List directory in chat workspace folder (E1 read-only).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "chat_id": {"type": "integer"},
                "path": {"type": "string", "description": "Relative path, empty for root"},
            },
            "required": ["chat_id"],
        },
    },
    {
        "name": "workspace_read",
        "description": "Read text file from chat workspace (max 512 KB).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "chat_id": {"type": "integer"},
                "path": {"type": "string"},
            },
            "required": ["chat_id", "path"],
        },
    },
    {
        "name": "workspace_git_status",
        "description": "Git status for chat workspace folder.",
        "inputSchema": {
            "type": "object",
            "properties": {"chat_id": {"type": "integer"}},
            "required": ["chat_id"],
        },
    },
    {
        "name": "action_propose",
        "description": "Propose shell command for user approval (E2) or auto-exec if session active (E3).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "agent": {"type": "string"},
                "chat_id": {"type": "integer"},
                "reason": {"type": "string"},
            },
            "required": ["command", "agent"],
        },
    },
    {
        "name": "action_status",
        "description": "Get status and output of a proposed/executed action.",
        "inputSchema": {
            "type": "object",
            "properties": {"action_id": {"type": "integer"}},
            "required": ["action_id"],
        },
    },
    {
        "name": "session_propose",
        "description": "Propose 15-minute auto-exec session for user approval (E3).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": {"type": "string"},
                "chat_id": {"type": "integer"},
                "reason": {"type": "string"},
            },
            "required": ["agent"],
        },
    },
    {
        "name": "session_status",
        "description": "Get session by id (pending/active/revoked/expired).",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "integer"}},
            "required": ["session_id"],
        },
    },
    {
        "name": "session_active",
        "description": "Get active exec session for a chat, if any.",
        "inputSchema": {
            "type": "object",
            "properties": {"chat_id": {"type": "integer"}},
            "required": ["chat_id"],
        },
    },
]

_TOOL_NAMES = {t["name"] for t in TOOL_DEFINITIONS}


def list_tools() -> list[dict[str, Any]]:
    return list(TOOL_DEFINITIONS)


def is_valid_tool(name: str) -> bool:
    return name in _TOOL_NAMES