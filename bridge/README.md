# Мост Office ↔ Cursor

## Из офиса → Cursor

- Файл: `from-office.jsonl`
- API: `GET http://127.0.0.1:8765/api/cursor/inbox`

В Cursor напишите **«проверь офис»** или используйте skill `office-hub`.

## Из Cursor → офис

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8765/api/cursor/inject -Method POST -ContentType "application/json" -Body '{"agent":"orchestrator","text":"План готов"}'
```

## Сборка 3D (R3F)

Перед запуском офиса (или автоматически в `start-office-lan.ps1`):

```powershell
cd C:\Users\USER\office-hub\scene
npm.cmd install
npm.cmd run build
```

Результат: `static/scene/office-scene.js`

## Доступ с телефона

```powershell
cd C:\Users\USER\office-hub
.\start-office-lan.ps1
```

В офисе: кнопка **Телефон** → копировать LAN URL.

## Туннель (интернет)

```powershell
.\start-office-tunnel.ps1
```

Требует `cloudflared` (`winget install Cloudflare.cloudflared`).