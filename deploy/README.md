# Team Office Hub — Deploy (B3)

## Архитектура

| Компонент | Где | URL |
|-----------|-----|-----|
| UI (статика) | GitHub Pages | `https://tanitsu-reberu.github.io/office-hub/` |
| API + WS + SQLite | Railway / Render | `https://your-hub.railway.app` |

Локально: `launch-office.bat` → `http://127.0.0.1:8765/?app=1&gfx=low`

## 1. GitHub Pages

### Подготовка репозитория

```powershell
cd C:\Users\USER\office-hub
git init
git add .
git commit -m "Team Office Hub"
git remote add origin https://github.com/tanitsu-reberu/office-hub.git
git push -u origin main
```

### Настройки репозитория

1. **Settings → Pages → Build: GitHub Actions**
2. **Settings → Secrets and variables → Actions:**
   - Variable `HUB_API` = `https://your-hub.railway.app`
   - Variable `HUB_BASE` = `/office-hub`
   - Secret `HUB_TOKEN` = тот же токен, что на Railway (для WebSocket с телефона)

### Локальная проверка сборки

```powershell
$env:HUB_API = 'https://your-hub.railway.app'
$env:HUB_BASE = '/office-hub'
.\scripts\prepare-pages.ps1
# Открыть _site/index.html через локальный сервер или push в main
```

Workflow: [.github/workflows/pages.yml](../.github/workflows/pages.yml)

## 2. Railway (backend)

1. New Project → Deploy from GitHub → `office-hub`
2. **Volume** mount at `/data`
3. **Variables:**

| Variable | Value |
|----------|-------|
| `DATA_DIR` | `/data` |
| `HUB_TOKEN` | случайный UUID (как в `.env` локально) |
| `ALLOWED_ORIGINS` | `https://tanitsu-reberu.github.io,http://127.0.0.1:8765,http://localhost:8765` |
| `PORT` | (Railway задаёт автоматически) |
| `CURSOR_API_LOCALHOST_ONLY` | `1` (по умолчанию; cursor inject только с ПК) |

4. Health check: `GET /api/health`

Dockerfile: [Dockerfile](../Dockerfile)

## 3. Cursor bridge (ПК онлайн)

На ПК с Cursor:

1. `HUB_URL=https://your-hub.railway.app` в env или skill
2. `HUB_TOKEN` = тот же токен
3. В Cursor: «проверь офис» — читает inbox с облака

Без ПК: UI работает (чаты, фото), задачи копятся в inbox до следующего «проверь офис».

## 4. Smoke checklist (B3.4)

- [ ] Pages открывается, 3D Classic грузится
- [ ] WS: индикатор «live» (нужен `HUB_TOKEN` в Pages build)
- [ ] Создать чат, отправить сообщение
- [ ] Загрузить фото
- [ ] `$team` → запись в inbox (с ПК + skill)