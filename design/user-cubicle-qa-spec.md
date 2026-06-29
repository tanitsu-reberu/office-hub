# Кабинет заказчика + модалка вопросов — Design Spec v1

## User cubicle (3D)

- Позиция: `USER_DESK { x: 0, z: 5.8, rot: Math.PI }` — перед meeting platform
- Accent: `#94a3b8` (slate, из AGENTS.user)
- Табличка на партиции: полоска `#64748b` + метка «Заказчик»
- Стол чуть шире визуально (опционально plane «документы»)

## Question modal

- Overlay: `rgba(30, 41, 59, 0.45)` backdrop
- Card: `--ui-surface`, radius `--ui-radius-md`, max-width 420px
- Header: emoji + имя агента (цвет agent)
- Body: текст вопроса 0.9rem
- Image: max-height 200px, rounded, border `--ui-border`
- Options: full-width ghost buttons, hover `--ui-brand-soft`
- Footer: textarea + primary «Ответить» + ghost «Позже»