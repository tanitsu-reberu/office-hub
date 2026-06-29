# Team Office Hub — PLAN

## Цель

1. **Яркий современный 3D-офис** — светлый coworking, больше декора, без просадки FPS.
2. **Полный hub при выключенном ПК** — GitHub Pages (фронт) + облачный FastAPI backend.

## Stack

- 3D: Vite + R3F (`scene/`) → `static/scene/office-scene.js`
- UI: Vanilla JS + `office.css`
- Backend: FastAPI + SQLite + WebSocket (`server.py`)
- Deploy: GitHub Pages + Railway/Render

## Roadmap (простое → сложное, утверждено 2026-06-28)

| # | Фаза | Статус |
|---|------|--------|
| R1 | Push v28 (H4+H5) на GitHub | в работе |
| H1 | Переименование чата в UI | pending |
| H2 | Badge непрочитанных (чаты + агенты) | pending |
| H3 | Drag-drop папки | pending |
| H5b | Premium 3D клик по кабинету | pending |
| B3.2 | Cloud backend | **blocked** — нет аккаунта Railway/Render |
| B3.4 | Smoke Pages ↔ API ↔ WS | pending (после B3.2) |
| Q1 | check-work A3 + G5 | pending |

## Фазы

- [x] **A1** Designer — `design/bright-office-spec.md`
- [x] **A2** Frontend — светлая сцена + CSS + build v10
- [ ] **A3** Check-work — FPS smoke, WebGL errors
- [x] **B1** Backend — CORS, DATA_DIR, HUB_TOKEN, Dockerfile, /api/health
- [x] **B2** Frontend — `__HUB_API__` remote mode
- [ ] **B3** Deploy — Pages workflow + cloud backend + skill update
  - [x] **B3.1** GitHub Pages — repo `tanitsu-reberu/office-hub`, peaceiris → `gh-pages`
  - [ ] **B3.2** Cloud backend — Railway/Render + volume `DATA_DIR` *(ждём регистрацию аккаунта)*
  - [x] **B3.3** Skill + `deploy/README.md`
  - [ ] **B3.4** Smoke Pages ↔ API ↔ WS

## Фаза H+ — Чаты и агенты

- [x] **H4a** Desktop: «Свернуть чат», FAB 💬, drawer + свайп (v27–28)
- [x] **H4b** Mobile: свайп между вкладками
- [ ] **H4** Floating chat window — позже
- [x] **H5** Личный чат — клик по кабинету, `target_agent`, `POST /api/agents/{id}/task` (v28, Classic+2D)
- [ ] **H5b** Premium 3D (`gfx=high`) — клик по кабинету
- [ ] **H1** PATCH названия чата в UI
- [ ] **H2** Badge непрочитанных (проектные чаты + личные потоки агентов)
- [ ] **H3** Drag-drop папки на зону чата

## Фазы C–G (готово)

- [x] **C** Лаунчер, кабинет заказчика, фото, Q&A
- [x] **D** Чаты с папками
- [x] **E** E1–E4 workspace / exec / sessions / MCP
- [x] **F** Мультифото (до 7)
- [x] **G1–G4** Темы Office
- [ ] **G5** check-work smoke (Classic + Premium)

## Ограничения

- Не добавлять тяжёлый postfx (DoF, global bloom, particles)
- Автоответы Cursor — только при включённом ПК + Cursor
- B3.2: пользователь без аккаунта Railway — нужна регистрация (free tier)

## Риски

- Публичный hub без auth → спам
- Free-tier cloud без volume → потеря SQLite
- H2: два типа unread (чат + agent thread) — сложнее UX

## Agent log

| Дата | Агент | Статус |
|------|-------|--------|
| 2026-06-28 | Orchestrator | Roadmap R1→Q1 утверждён; Railway blocked |
| 2026-06-28 | Frontend | v28: H5 личные чаты, H4 collapse |
| 2026-06-28 | Backend | `target_agent`, `/api/agents/{id}/task` |