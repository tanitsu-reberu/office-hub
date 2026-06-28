/** Team Office — theme tokens (UI + 3D Classic). Source of truth for office.css + office-3d.js */
window.OFFICE_THEMES = {
  default: 'light',
  list: [
    { id: 'light', name: 'Светлая', desc: 'Coworking · по умолчанию', preview: ['#d8e0ea', '#7c3aed', '#64748b'], themeColor: '#d8e0ea' },
    { id: 'purple', name: 'Фиолетовая', desc: 'Brand Team Office', preview: ['#e8e0f4', '#8b5cf6', '#7c3aed'], themeColor: '#e8e0f4' },
    { id: 'ocean', name: 'Океан', desc: 'Бирюза и холодный свет', preview: ['#e0eef4', '#22d3ee', '#0891b2'], themeColor: '#e0eef4' },
    { id: 'neon', name: 'Неон', desc: 'Тёмный UI + яркий офис', preview: ['#0c0a18', '#a855f7', '#34d399'], themeColor: '#0c0a18' },
    { id: 'dark', name: 'Тёмная', desc: 'Ночной режим', preview: ['#1a1d26', '#4f8ef7', '#8a90a8'], themeColor: '#1a1d26' },
    { id: 'gray', name: 'Серая', desc: 'Нейтральная', preview: ['#e8e8e8', '#6b7280', '#9ca3af'], themeColor: '#e8e8e8' },
  ],
  scene3d: {
    light: {
      bg: '#c2cad8', fog: '#b2bcc8', floor: '#a8b2c2', gridMain: '#92a0b4', gridSub: '#7e8ea4',
      platform: '#c8d2e0', platformRing: '#a78bfa', desk: '#d4ccc0', partition: '#9eacc0',
      partitionTop: '#8a98ac', wood: '#a89888', monitor: '#2a3344', chair: '#7e8ea0',
      hemiSky: '#fff4e8', hemiGround: '#a8b2c2', ambient: '#ffffff', sun: '#fff8f0', fill: '#a8b8d4', rim: '#b4a0fc',
      labelBg: 'rgba(240, 244, 250, 0.9)',
    },
    purple: {
      bg: '#c8c0dc', fog: '#b8b0d0', floor: '#b0a8c4', gridMain: '#9a92b0', gridSub: '#847c9a',
      platform: '#d0c8e4', platformRing: '#8b5cf6', desk: '#dcd4cc', partition: '#a8a0c0',
      partitionTop: '#9890b4', wood: '#b0a090', monitor: '#2a3344', chair: '#8a8498',
      hemiSky: '#f0e8ff', hemiGround: '#b0a8c4', ambient: '#ffffff', sun: '#f5f0ff', fill: '#c4b8e8', rim: '#a78bfa',
      labelBg: 'rgba(245, 240, 255, 0.92)',
    },
    ocean: {
      bg: '#b8ccd8', fog: '#a8bcc8', floor: '#98b0c0', gridMain: '#7a98ac', gridSub: '#688898',
      platform: '#c0d4e0', platformRing: '#22d3ee', desk: '#ccd8dc', partition: '#90a8b8',
      partitionTop: '#7a94a8', wood: '#98a8a0', monitor: '#1e2a34', chair: '#6a8494',
      hemiSky: '#e8f8ff', hemiGround: '#98b0c0', ambient: '#ffffff', sun: '#e0f4ff', fill: '#7ec8e8', rim: '#22d3ee',
      labelBg: 'rgba(232, 248, 255, 0.92)',
    },
    neon: {
      bg: '#1a1530', fog: '#12102a', floor: '#2a2448', gridMain: '#3a3460', gridSub: '#2a2448',
      platform: '#322c58', platformRing: '#a855f7', desk: '#3a3458', partition: '#4a4470',
      partitionTop: '#5a5488', wood: '#4a4468', monitor: '#0a0818', chair: '#5a5480',
      hemiSky: '#c4b5fd', hemiGround: '#2a2448', ambient: '#9080c0', sun: '#e0d0ff', fill: '#8060c0', rim: '#a855f7',
      labelBg: 'rgba(30, 24, 56, 0.88)',
    },
    dark: {
      bg: '#1a2744', fog: '#152238', floor: '#1e2d48', gridMain: '#2d3d58', gridSub: '#1e2d48',
      platform: '#2a3a54', platformRing: '#4f8ef7', desk: '#334155', partition: '#3d4f68',
      partitionTop: '#4a5c78', wood: '#475569', monitor: '#0f172a', chair: '#64748b',
      hemiSky: '#c7d2fe', hemiGround: '#1e293b', ambient: '#94a3b8', sun: '#ffffff', fill: '#64748b', rim: '#4f8ef7',
      labelBg: 'rgba(15, 23, 42, 0.85)',
    },
    gray: {
      bg: '#b8bcc4', fog: '#a8acb4', floor: '#a0a4ac', gridMain: '#888c94', gridSub: '#787c84',
      platform: '#c0c4cc', platformRing: '#9ca3af', desk: '#c8c4bc', partition: '#a8acb4',
      partitionTop: '#989ca4', wood: '#a0a098', monitor: '#374151', chair: '#6b7280',
      hemiSky: '#f0f0f0', hemiGround: '#a0a4ac', ambient: '#ffffff', sun: '#f8f8f8', fill: '#b0b4bc', rim: '#9ca3af',
      labelBg: 'rgba(240, 240, 242, 0.92)',
    },
  },
};
