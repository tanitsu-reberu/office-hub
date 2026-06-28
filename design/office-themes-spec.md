# Office Themes — Design Spec v1.0

**Date:** 2026-06-28  
**Medium:** Team Office UI + 3D Classic + Premium  
**Reference:** ПВУ `ahu_3d_viewer` (`data-theme`, theme cards, localStorage)

## Themes

| id | Name | Mood |
|----|------|------|
| `light` | Светлая | Default coworking |
| `purple` | Фиолетовая | Brand purple |
| `ocean` | Океан | Cool cyan |
| `neon` | Неон | Dark + vivid |
| `dark` | Тёмная | Night mode |
| `gray` | Серая | Neutral |

Agent avatar colors are **fixed** across themes.

## Implementation

- `data-theme` on `<html>`, `localStorage.office_theme`
- Tokens: [static/themes.js](../static/themes.js) (3D Classic), [office.css](../static/office.css) (UI `--ui-*`, `--iso-*`)
- Event: `office-theme-change` with `{ detail: { themeId } }`
- Premium: mutable `palette` in `scene/src/theme/palette.ts`

## UX

- Topbar button «Тема» → modal with preview cards (3 circles)
- Transition 0.35s on `background` / `color` (respect `prefers-reduced-motion`)
- Boot: inline script in `index.html` head prevents flash