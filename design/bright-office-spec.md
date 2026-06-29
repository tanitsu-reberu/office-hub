# Bright Modern Coworking — Team Office 3D Design Spec

**Version:** 1.0  
**Date:** 2026-06-27  
**Medium:** 3D web scene (R3F) + DOM overlay UI (`office.css`)  
**Audience:** Заказчик и команда агентов — визуальный hub для координации задач  
**Goal:** Офис должен ощущаться **светлым, живым и профессиональным** (modern coworking), не тёмным «складом». Сохранить purple-brand оркестратора и цвета агентов.  
**Mood:** bright · warm · collaborative  
**Deliverable:** Этот spec → реализация в `scene/src/` + `static/office.css`

---

## Design Brief (подтверждение)

| Поле | Значение |
|------|----------|
| Стиль | Светлый open-space coworking, дневной свет с окна, минимализм без пустоты |
| Референс | Текущая геометрия `CUBICLES`, `MeetingPlatform`, `Floor` — **не менять layout** |
| Ограничение | Без particles, DoF, global bloom, новых шейдеров, `drei Html` |
| Performance | Декор ≤ 30 draw calls; на `low` tier — упрощённый набор |
| Мотив | **Мягкие прямоугольники + цветные accent-полоски** — повторяется в UI и 3D |

---

## 1. Цветовая система (3D → `palette.ts`)

Заменить тёмную палитру на светлую. Значения готовы к копированию в `scene/src/theme/palette.ts`.

### 1.1 Environment

| Token | Hex | Назначение |
|-------|-----|------------|
| `bg` | `#e8edf5` | Canvas background (небо/стены за сценой) |
| `fog` | `#dce4f0` | Туман — светлый, почти незаметный |

### 1.2 Floor & grid

| Token | Hex | Назначение |
|-------|-----|------------|
| `floor` | `#d4dae6` | Основной пол (светло-серый с синим подтоном) |
| `floorGrid` | `#b8c4d8` | Ячейки сетки |
| `floorGridSection` | `#9aa8be` | Секции сетки (каждые 4 м) |
| `floorAccent` | `#c4b5fd` | Круг под meeting platform (opacity 0.12) |
| `carpet` | `#8b5cf6` | Ковёр-зона platform (opacity 0.22, `meshBasicMaterial`) |

**Floor material:** `roughness: 0.82`, `metalness: 0.08`, `envMapIntensity: 0.55` (physical) / `0.45` (standard).

### 1.3 Furniture & architecture

| Token | Hex | Назначение |
|-------|-----|------------|
| `desk` | `#e8e2d8` | Столешница (светлое дерево / ламинат) |
| `deskEdge` | `#c8bfb0` | Боковая кромка стола (опционально) |
| `partition` | `#c8d0e0` | Партиции open-space |
| `partitionTop` | `#b0bcd0` | Верхняя кромка партиции (тонкая полоска) |
| `wood` | `#b8a898` | Подставка монитора |
| `monitorBezel` | `#2a3344` | Рамка монитора (тёмная для контраста экрана) |
| `chair` | `#94a3b8` | Сиденье кресла |
| `ceiling` | `#f0f4fa` | Потолок (если нужен back-wall plane) |

### 1.4 Meeting platform (сохранить purple-акцент)

| Token | Hex | Назначение |
|-------|-----|------------|
| `platform` | `#e2e8f4` | Диск платформы (светлый металл) |
| `platformRing` | `#a78bfa` | Внешнее кольцо |
| `platformRingInner` | `#8b5cf6` | Внутреннее кольцо |
| `platformGlow` | `#c4b5fd` | BloomLight (только selective) |

### 1.5 Lighting colors

| Token | Hex | Назначение |
|-------|-----|------------|
| `keyLight` | `#fff8f0` | Основной солнечный свет (тёплый) |
| `fillLight` | `#b8c8e8` | Hemisphere sky |
| `fillGround` | `#d4dae6` | Hemisphere ground (= fog/floor) |
| `rimLight` | `#c4b5fd` | Фиолетовый rim сзади |
| `accentPurple` | `#8b5cf6` | Accent wall, UI связь |

### 1.6 Agent accents (не менять)

Из `constants.ts` / `AGENTS`:

| Agent | Color |
|-------|-------|
| orchestrator | `#8b5cf6` |
| designer | `#ec4899` |
| frontend | `#06b6d4` |
| backend | `#22c55e` |
| owencloud | `#f59e0b` |

### 1.7 DOM labels (3D overlay)

| Token | Value |
|-------|-------|
| `labelBg` | `rgba(255, 255, 255, 0.88)` |
| `labelBorder` | `rgba(139, 92, 246, 0.35)` |
| `labelText` | `#1e293b` |
| `labelName` | `#6d28d9` |

### 1.8 Emissive targets (снизить vs dark — иначе пересвет на bloom)

```ts
emissive: {
  platformRing: 0.38,        // было 0.52
  platformRingPulse: 0.10,   // было 0.14
  screenMin: 0.35,           // было 0.42
  screenBoost: 0.18,         // было 0.22
  ceilingPanel: 0.18,        // NEW — LED панели
}
```

---

## 2. Освещение (`Lighting.tsx` + `quality.ts`)

### 2.1 Light rig

| Light | Position | Intensity | Color | Notes |
|-------|----------|-----------|-------|-------|
| `hemisphereLight` | — | `0.42` | sky: `fillLight`, ground: `fillGround` | Было 0.36 |
| `ambientLight` | — | `0.28` | `#e8edf5` | Было 0.15 |
| `directionalLight` (key) | `[12, 22, 8]` | `1.55` | `keyLight` | Имитация окна справа-сверху |
| `directionalLight` (fill) | `[-6, 14, 10]` | `0.48` | `fillLight` | Мягкая заливка |
| `directionalLight` (rim) | `[0, 8, -16]` | `0.28` | `rimLight` | Подсветка platform сзади |
| `BloomLight` | `[0, 2.6, 0]` | `0.55` | `platformGlow` | Только если `selectiveBloom`; было 0.75 |

### 2.2 Fog

| Tier | Fog |
|------|-----|
| `high` / `medium` | `fog: [palette.fog, 28, 48]` — дальше и светлее, почти не виден |
| `low` | fog **off** (удалить attach) |

### 2.3 Quality profile changes (`quality.ts`)

| Setting | high | medium | low |
|---------|------|--------|-----|
| `envPreset` | `apartment` | `apartment` | `city` |
| `envIntensity` | `0.52` | `0.48` | `0.38` |
| `exposure` | `1.28` | `1.22` | `1.08` |
| `bloomIntensity` | `0.65` | `0.55` | `0` |

> `apartment` даёт тёплый дневной interior HDRI — ключевое отличие от `warehouse`.

---

## 3. Декор сцены (`OfficeDressing.tsx` — NEW)

Один компонент, props: `{ profile: QualityProfile }`. Все материалы — `meshStandardMaterial` или `meshBasicMaterial` (прозрачность). **Без** `castShadow` на мелочи.

### 3.1 Потолочные LED-панели

Плоские `planeGeometry`, rotation `[-π/2, 0, 0]`, `y = 3.2`.

| # | Position `[x, y, z]` | Size `[w, d]` | Emissive color | `emissiveIntensity` |
|---|----------------------|---------------|----------------|---------------------|
| 1 | `[0, 3.2, 0]` | `[2.4, 1.2]` | `#fffef8` | `0.20` |
| 2 | `[-7, 3.2, 3]` | `[1.8, 1.0]` | `#fffef8` | `0.18` |
| 3 | `[7, 3.2, 3]` | `[1.8, 1.0]` | `#fffef8` | `0.18` |
| 4 | `[-7, 3.2, -5]` | `[1.8, 1.0]` | `#fffef8` | `0.18` |
| 5 | `[7, 3.2, -5]` | `[1.8, 1.0]` | `#fffef8` | `0.18` |
| 6 | `[0, 3.2, -6]` | `[2.0, 1.0]` | `#fffef8` | `0.18` |

Корпус панели (опционально, thin box под plane): `color: #e8edf5`, `roughness: 0.9`.

**Tier:** `high` + `medium` — все 6; `low` — только #1 (над platform).

### 3.2 Accent wall (задняя стена)

Один `plane` за оркестратором:

- Position: `[0, 2.0, -10.5]`
- Size: `[14, 4]`
- Material: `meshStandardMaterial`, `color: #e2e8f4`
- Поверх — горизонтальная полоса `meshBasicMaterial`:
  - Position: `[0, 2.4, -10.48]`
  - Size: `[10, 0.35]`
  - Color: `#8b5cf6`, opacity `0.55`

**Tier:** `high` + `medium`; `low` — skip.

### 3.3 Растения (stylized low-poly)

Компонент `Plant({ x, z })`:

- Горшок: `cylinderGeometry(0.18, 0.22, 0.28, 8)`, `color: #c8bfb0`, `y: 0.14`
- Ствол: `cylinderGeometry(0.04, 0.05, 0.35, 6)`, `color: #78716c`, `y: 0.45`
- Крона: `sphereGeometry(0.32, 8, 8)`, `color: #4ade80`, `y: 0.78`

| # | Position `[x, z]` |
|---|-------------------|
| 1 | `[-3.5, 2.5]` — между designer и platform |
| 2 | `[3.5, 2.5]` — между frontend и platform |
| 3 | `[-10, 0]` — у левого края |
| 4 | `[10, -2]` — у правого края |

**Tier:** `high` — 4; `medium` — 2 (#1, #2); `low` — 0.

### 3.4 Ковёр meeting zone

Уже частично в `Floor.tsx` — усилить:

- `circleGeometry(3.4, 32)`, `y: 0.025`
- `meshBasicMaterial`, `color: carpet`, `transparent`, `opacity: 0.22`
- Тонкое внешнее кольцо: `ringGeometry(3.2, 3.5, 32)`, opacity `0.15`, color `#8b5cf6`

### 3.5 Боковые «окна» (световые полосы)

Два вертикальных plane по бокам сцены — имитация дневного света:

| Side | Position | Size | Color | Opacity |
|------|----------|------|-------|---------|
| Right | `[13.5, 2.5, 0]` rot `[0, -π/2, 0]` | `[4, 3.5]` | `#fff8f0` | `0.08` |
| Left | `[-13.5, 2.5, 0]` rot `[0, π/2, 0]` | `[4, 3.5]` | `#fff8f0` | `0.06` |

**Tier:** `high` + `medium`; `low` — skip.

### 3.6 Draw call budget

| Tier | Max new meshes |
|------|----------------|
| high | ~28 |
| medium | ~18 |
| low | ~3 (ковёр + 1 LED) |

---

## 4. Кабинки (`Cubicle.tsx`)

Геометрия **без изменений**. Только материалы и accent-полоски.

### 4.1 Материалы

- Стол: `palette.desk`, `roughness: 0.58`, `metalness: 0.06`
- Партиции: `palette.partition`, `roughness: 0.72`, `metalness: 0.04`
- Подставка: `palette.wood`
- Кресло: `palette.chair` (было `#566480`)
- Плинтус зоны: accent strip на полу — оставить, opacity `0.28` (было 0.22)

### 4.2 Accent strips на партициях

На задней партиции (`z: -1.5`), по центру:

```tsx
<mesh position={[0, 1.5, -1.44]}>
  <planeGeometry args={[2.8, 0.12]} />
  <meshBasicMaterial color={accent} />
</mesh>
```

На боковой партиции (`x: -1.74`):

```tsx
<mesh position={[-1.68, 1.2, 0]}>
  <planeGeometry args={[0.12, 2.0]} />
  <meshBasicMaterial color={accent} />
</mesh>
```

### 4.3 Верхняя кромка партиции

Тонкий box `color: palette.partitionTop` на верху каждой партиции — «finished office» look.

---

## 5. Пол (`Floor.tsx`)

- Основной plane: `palette.floor`
- Grid: более контрастный на светлом фоне (см. токены §1.2)
- Круг platform glow: `palette.floorAccent`, opacity `0.12`
- Ковёр: см. §3.4

---

## 6. Meeting platform (`MeetingPlatform.tsx`)

- Диск: `palette.platform` — светлый металл
- Кольца: без изменения цветов, только emissive из §1.8
- `clearcoat` на high: `0.35` (было 0.45) — меньше зеркальности на светлом полу

---

## 7. UI Design Tokens (`office.css`)

Светлая оболочка, **purple brand** сохранён. CSS variables в `:root` — фронтенд добавляет блок в начало файла.

```css
:root {
  /* Surfaces */
  --ui-bg: #f4f6fa;
  --ui-surface: #ffffff;
  --ui-surface-muted: #eef2f7;
  --ui-border: #d8e0ec;
  --ui-border-strong: #c5d0e0;

  /* Text */
  --ui-text: #1e293b;
  --ui-text-muted: #64748b;
  --ui-text-subtle: #94a3b8;

  /* Brand */
  --ui-brand: #7c3aed;
  --ui-brand-hover: #6d28d9;
  --ui-brand-soft: rgba(139, 92, 246, 0.12);
  --ui-brand-border: rgba(139, 92, 246, 0.28);
  --ui-brand-text: #6d28d9;
  --ui-accent-badge: #8b5cf6;

  /* Status */
  --ui-success: #059669;
  --ui-warning: #d97706;
  --ui-live: #10b981;

  /* Radius & shadow */
  --ui-radius-sm: 8px;
  --ui-radius-md: 12px;
  --ui-radius-pill: 999px;
  --ui-shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.06);
  --ui-shadow-md: 0 4px 16px rgba(15, 23, 42, 0.08);

  /* Spacing (8px grid) */
  --ui-space-1: 4px;
  --ui-space-2: 8px;
  --ui-space-3: 12px;
  --ui-space-4: 16px;
}
```

### 7.1 Component mapping

| Selector | Property | New value |
|----------|----------|-----------|
| `body` | background | `var(--ui-bg)` |
| `body` | color | `var(--ui-text)` |
| `.topbar` | background | `rgba(255, 255, 255, 0.92)` |
| `.topbar` | border-bottom | `1px solid var(--ui-border)` |
| `.subtitle` | color | `var(--ui-text-muted)` |
| `.render-mode` | background | `var(--ui-brand-soft)` |
| `.render-mode` | color | `var(--ui-brand-text)` |
| `.active-task` | background | `var(--ui-brand-soft)` |
| `.active-task` | color | `var(--ui-brand-text)` |
| `.btn-ghost` | background | `var(--ui-surface-muted)` |
| `.btn-ghost` | color | `var(--ui-text)` |
| `.panel-chat` / `.panel-team` | background | `var(--ui-surface)` |
| `.panel-office` | border-right | `1px solid var(--ui-border)` |
| `.office-viewport` | background | `radial-gradient(ellipse 90% 70% at 50% 40%, #eef2f7, #e8edf5)` |
| `.head-bubble` | background | `rgba(255, 255, 255, 0.92)` |
| `.head-bubble` | color | `var(--ui-text)` |
| `.head-bubble` | border | `1px solid var(--ui-brand-border)` |
| `.head-bubble` | box-shadow | `var(--ui-shadow-md)` |
| `.head-bubble-name` | color | `var(--ui-brand-text)` |
| `.name-tag` | background | `rgba(255, 255, 255, 0.9)` |
| `.name-tag` | color | `var(--ui-text)` |
| `.chat-form textarea` | background | `var(--ui-surface-muted)` |
| `.chat-form textarea` | border | `1px solid var(--ui-border)` |
| `.chat-form textarea` | color | `var(--ui-text)` |
| `.msg` | background | `var(--ui-surface-muted)` |
| `.team-card` | background | `var(--ui-surface)` |
| `.team-card` | border | `1px solid var(--ui-border)` |
| `.notify-toast` | background | `rgba(255, 255, 255, 0.96)` |
| `.modal-box` | background | `var(--ui-surface)` |
| `.mobile-tabs` | background | `var(--ui-surface)` |

### 7.2 Контраст (accessibility)

| Pair | Ratio | Pass |
|------|-------|------|
| `--ui-text` on `--ui-bg` | ~12:1 | ✅ AA |
| `--ui-text-muted` on `--ui-surface` | ~5.2:1 | ✅ AA |
| `--ui-brand-text` on `--ui-brand-soft` | ~4.6:1 | ✅ AA |
| White on `--ui-brand` (buttons) | ~5.8:1 | ✅ AA |

---

## 8. Что НЕ делать

- ❌ Particles, sparkles, `Atmosphere`, DoF, Noise pass
- ❌ Global bloom (только selective на platform + screens)
- ❌ `wrapEffect(N8AO)` — только `<N8AO>` primitive
- ❌ `drei Html` для лейблов
- ❌ Тёмный фон `#090d18` и warehouse HDRI
- ❌ Добавлять GLB-модели / текстуры > 512 KB
- ❌ Менять позиции `CUBICLES` / `DESK` / `MEETING`

---

## 9. Acceptance criteria (для Frontend)

- [ ] `palette.ts` обновлён по §1
- [ ] `Lighting.tsx` — light rig §2.1, fog §2.2
- [ ] `quality.ts` — profiles §2.3, тип `envPreset` расширен `'apartment'`
- [ ] `OfficeDressing.tsx` создан, подключён в `OfficeScene.tsx`
- [ ] `Cubicle.tsx` — accent strips §4.2
- [ ] `Floor.tsx` — ковёр §3.4
- [ ] `office.css` — `:root` tokens §7 + component mapping
- [ ] `index.html` cache bump `?v=10`
- [ ] `npm run build` без ошибок
- [ ] Badge: `3D Premium · high/medium`, нет WebGL crash
- [ ] Визуально: офис **заметно светлее**, не пересвечен на medium tier

---

## 10. Файлы для Frontend

```
scene/src/theme/palette.ts          — §1
scene/src/components/Lighting.tsx   — §2
scene/src/quality.ts                — §2.3
scene/src/components/OfficeDressing.tsx — §3 (NEW)
scene/src/components/Cubicle.tsx    — §4
scene/src/components/Floor.tsx      — §5
scene/src/components/MeetingPlatform.tsx — §6
scene/src/OfficeScene.tsx           — import OfficeDressing
static/office.css                   — §7
static/index.html                   — ?v=10
```

---

## Self-review

- [x] Palette topic-specific (coworking light, not generic dark tech)
- [x] Hierarchy: 60% light neutrals, 30% furniture, 10% agent accents + purple brand
- [x] Motif consistent: rounded rects + accent strips (3D + UI)
- [x] Accessibility contrast documented
- [x] 8px spacing grid in UI tokens
- [x] Performance budget per tier
- [x] No heavy FX in scope