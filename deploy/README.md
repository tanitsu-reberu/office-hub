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

Репозиторий содержит `railway.toml` + `Dockerfile` — Railway подхватит Docker-сборку автоматически.

### Вариант A — Dashboard (рекомендуется после регистрации через GitHub)

1. https://railway.com/new → **Deploy from GitHub repo** → `tanitsu-reberu/office-hub`
2. **Service → Settings → Volumes** → Add Volume → mount path **`/data`**
3. **Variables** (Raw Editor):

```env
DATA_DIR=/data
HUB_TOKEN=<тот же токен что в office-hub/.env>
ALLOWED_ORIGINS=https://tanitsu-reberu.github.io,http://127.0.0.1:8765,http://localhost:8765
CURSOR_API_LOCALHOST_ONLY=1
```

4. **Networking** → **Generate Domain** → скопировать URL (`https://….up.railway.app`)
5. Health: `GET https://YOUR-DOMAIN.up.railway.app/api/health` → `{"ok":true,...}`

### Вариант B — CLI

```powershell
npm install -g @railway/cli
railway login
cd C:\Users\USER\office-hub
powershell -ExecutionPolicy Bypass -File deploy\railway-setup.ps1
# Dashboard: добавить Volume /data + Generate Domain
railway up
```

### После деплоя — связать GitHub Pages

**Settings → Secrets and variables → Actions** в `tanitsu-reberu/office-hub`:

| Имя | Тип | Значение |
|-----|-----|----------|
| `HUB_API` | Variable | `https://YOUR-DOMAIN.up.railway.app` |
| `HUB_BASE` | Variable | `/office-hub` |
| `HUB_TOKEN` | Secret | тот же `HUB_TOKEN` |

Затем: **Actions → Deploy to GitHub Pages → Run workflow**

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