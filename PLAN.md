# Team Office Hub — PLAN

## Цель

1. **Яркий современный 3D-офис** — светлый coworking, больше декора, без просадки FPS.
2. **Полный hub при выключенном ПК** — GitHub Pages (фронт) + облачный FastAPI backend.

## Stack

- 3D: Vite + R3F (`scene/`) → `static/scene/office-scene.js`
- UI: Vanilla JS + `office.css`
- Backend: FastAPI + SQLite + WebSocket (`server.py`)
- Deploy: GitHub Pages + Railway/Render

## Фазы

- [x] **A1** Designer — `design/bright-office-spec.md`
- [x] **A2** Frontend — светлая сцена + CSS + build v10
- [ ] **A3** Check-work — FPS smoke, WebGL errors
- [x] **B1** Backend — CORS, DATA_DIR, HUB_TOKEN, Dockerfile, /api/health
- [x] **B2** Frontend — `__HUB_API__` remote mode
- [ ] **B3** Deploy — Pages workflow + cloud backend + skill update *(в работе, 2026-06-28)*
  - [x] **B3.1** GitHub Pages — workflow, `hub-config.js`, relative paths, cloud banner
  - [ ] **B3.2** Cloud backend — Railway/Render + volume `DATA_DIR` *(нужен push в GitHub + deploy)*
  - [x] **B3.3** Skill + `deploy/README.md`
  - [ ] **B3.4** Smoke Pages ↔ API ↔ WS

## Фаза C — Лаунчер + кабинет заказчика (2026-06-27)

- [x] **C1** Launcher — `launch-office.ps1/.bat`, `install-game-shortcut.ps1`, `README-launcher.md`
- [x] **C2** User cubicle — `UserCubicle.tsx`, `USER_DESK`, тег «Вы · Заказчик»
- [x] **C3** Фото — `POST /api/uploads`, вложения в чате и мосте
- [x] **C4** Q&A — `agent_questions`, модалка, `visitUser()`, auto-вопрос после $team
- [x] **C5** Smoke — launcher + вопрос + фото

## Фаза D — Чаты с папками (2026-06-27)

- [x] **D1** Таблица `chats`, `chat_id` в messages/questions/inbox
- [x] **D2** UI списка чатов, создание, `pick-folder`, open-folder
- [x] **D3** Удаление чата (модалка), фикс «Обзор…» (`-STA`)

## Фаза E — Roadmap (управление ПК по согласию)

Управление ПК **только по согласию** (как Claude Code):

1. **E1 Read-only** — `list_dir`, `read_file`, `git status` в `folder_path` чата — **готово**
2. **E2 Approved exec** — очередь команд, модалка Approve/Reject, whitelist (`git`, `npm`, `npx`, `py`, `python`, `pip`, `node`, `cargo`, `uvicorn`) — **готово**
3. **E3 Sessions** — временная сессия (15 мин), auto-exec, kill-switch, audit `bridge/actions.jsonl` — **готово**
4. **E4 Agent tools** — MCP + `/api/cursor/tools/invoke`, localhost + `HUB_TOKEN` — **готово**

## Фаза H+ — Чаты и агенты (после B3, утверждено 2026-06-28)

- [ ] **H4** Сворачиваемый чат — collapse drawer + floating window (сравнить оба, desktop-first)
- [ ] **H5** Личный чат — клик по кабинету → `target_agent`, `POST /api/agents/{id}/task`
- [ ] **H1** PATCH названия чата в UI
- [ ] **H2** Badge непрочитанных
- [ ] **H3** Drag-drop папки на зону чата

## Фаза F — Мультифото

- [x] **F1** До 7 фото в одном сообщении (UI + parallel upload)
- [x] **F2** Backend: `MAX_ATTACHMENTS_PER_MESSAGE = 7`
- [x] **F3** Сетка превью и в ленте чата, skill update, smoke

## Фаза G — Темы Office (2026-06-28)

- [x] **G1** Designer — `design/office-themes-spec.md`, `static/themes.js`
- [x] **G2** UI — `data-theme`, модалка «Тема», `office.css` (6 тем)
- [x] **G3** 3D Classic + 2D — `applySceneTheme`, `office-theme-change`
- [x] **G4** 3D Premium — `palettes.ts`, rebuild `office-scene.js`
- [ ] **G5** check-work smoke (Classic + Premium gfx=high)

## Ограничения

- Не добавлять тяжёлый postfx (DoF, global bloom, particles)
- `OfficeDressing` упрощается на `low` tier
- Автоответы Cursor-агентов — только при включённом ПК + Cursor

## Риски

- Публичный hub без auth → спам
- Free-tier cloud без volume → потеря SQLite
- Светлая сцена + bloom → пересвет на high tier

## Agent log

| Дата | Агент | Статус |
|------|-------|--------|
| 2026-06-27 | Orchestrator | План утверждён |
| 2026-06-27 | Designer | `design/bright-office-spec.md` v1.0 |
| 2026-06-27 | Frontend | Bright scene + OfficeDressing + light UI v10 |
| 2026-06-28 | Orchestrator | План B3→H+ утверждён; старт B3 |
| 2026-06-28 | Backend | B3.1: pages.yml, prepare-pages.ps1, hub-config, deploy/README |
| 2026-06-28 | Frontend | v26: relative paths, cloud banner, mediaUrl/staticUrl