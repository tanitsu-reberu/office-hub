export type ScenePalette = {
  bg: string;
  fog: string;
  floor: string;
  floorGrid: string;
  floorGridSection: string;
  floorAccent: string;
  carpet: string;
  desk: string;
  deskEdge: string;
  partition: string;
  partitionTop: string;
  wood: string;
  monitorBezel: string;
  chair: string;
  ceiling: string;
  platform: string;
  platformRing: string;
  platformRingInner: string;
  platformGlow: string;
  keyLight: string;
  fillLight: string;
  fillGround: string;
  rimLight: string;
  accentPurple: string;
  labelBg: string;
  labelBorder: string;
  labelText: string;
  labelName: string;
  emissive: {
    platformRing: number;
    platformRingPulse: number;
    screenMin: number;
    screenBoost: number;
    ceilingPanel: number;
  };
};

const light: ScenePalette = {
  bg: '#c2cad8',
  fog: '#b2bcc8',
  floor: '#a8b2c2',
  floorGrid: '#92a0b4',
  floorGridSection: '#7e8ea4',
  floorAccent: '#a78bfa',
  carpet: '#8b5cf6',
  desk: '#d4ccc0',
  deskEdge: '#b8aea2',
  partition: '#9eacc0',
  partitionTop: '#8a98ac',
  wood: '#a89888',
  monitorBezel: '#2a3344',
  chair: '#7e8ea0',
  ceiling: '#d8e0ea',
  platform: '#c8d2e0',
  platformRing: '#a78bfa',
  platformRingInner: '#8b5cf6',
  platformGlow: '#c4b5fd',
  keyLight: '#fff4e8',
  fillLight: '#a8b8d4',
  fillGround: '#a8b2c2',
  rimLight: '#b4a0fc',
  accentPurple: '#8b5cf6',
  labelBg: 'rgba(240, 244, 250, 0.9)',
  labelBorder: 'rgba(139, 92, 246, 0.35)',
  labelText: '#1e293b',
  labelName: '#6d28d9',
  emissive: { platformRing: 0.36, platformRingPulse: 0.09, screenMin: 0.32, screenBoost: 0.16, ceilingPanel: 0.14 },
};

function p(base: ScenePalette, patch: Partial<ScenePalette>): ScenePalette {
  return { ...base, ...patch, emissive: { ...base.emissive, ...(patch.emissive || {}) } };
}

export const THEME_PALETTES: Record<string, ScenePalette> = {
  light,
  purple: p(light, {
    bg: '#c8c0dc',
    fog: '#b8b0d0',
    floor: '#b0a8c4',
    floorGrid: '#9a92b0',
    floorGridSection: '#847c9a',
    floorAccent: '#c4b5fd',
    platform: '#d0c8e4',
    platformRing: '#8b5cf6',
    platformRingInner: '#7c3aed',
    platformGlow: '#ddd6fe',
    fillLight: '#c4b8e8',
    rimLight: '#a78bfa',
    accentPurple: '#8b5cf6',
    labelName: '#6d28d9',
  }),
  ocean: p(light, {
    bg: '#b8ccd8',
    fog: '#a8bcc8',
    floor: '#98b0c0',
    floorGrid: '#7a98ac',
    floorGridSection: '#688898',
    floorAccent: '#22d3ee',
    carpet: '#0891b2',
    platform: '#c0d4e0',
    platformRing: '#22d3ee',
    platformRingInner: '#0891b2',
    platformGlow: '#67e8f9',
    keyLight: '#e0f4ff',
    fillLight: '#7ec8e8',
    rimLight: '#22d3ee',
    accentPurple: '#0891b2',
    labelName: '#0e7490',
    labelBorder: 'rgba(8, 145, 178, 0.35)',
  }),
  neon: p(light, {
    bg: '#1a1530',
    fog: '#12102a',
    floor: '#2a2448',
    floorGrid: '#3a3460',
    floorGridSection: '#2a2448',
    floorAccent: '#a855f7',
    carpet: '#a855f7',
    desk: '#3a3458',
    partition: '#4a4470',
    partitionTop: '#5a5488',
    wood: '#4a4468',
    chair: '#5a5480',
    ceiling: '#1e1838',
    platform: '#322c58',
    platformRing: '#a855f7',
    platformRingInner: '#9333ea',
    platformGlow: '#c4b5fd',
    keyLight: '#e0d0ff',
    fillLight: '#8060c0',
    fillGround: '#2a2448',
    rimLight: '#a855f7',
    accentPurple: '#a855f7',
    labelBg: 'rgba(30, 24, 56, 0.88)',
    labelText: '#ece8ff',
    labelName: '#c4b5fd',
    emissive: { platformRing: 0.55, platformRingPulse: 0.14, screenMin: 0.45, screenBoost: 0.22, ceilingPanel: 0.2 },
  }),
  dark: p(light, {
    bg: '#1a2744',
    fog: '#152238',
    floor: '#1e2d48',
    floorGrid: '#2d3d58',
    floorGridSection: '#1e2d48',
    floorAccent: '#4f8ef7',
    carpet: '#4f8ef7',
    desk: '#334155',
    partition: '#3d4f68',
    partitionTop: '#4a5c78',
    wood: '#475569',
    chair: '#64748b',
    ceiling: '#1a2238',
    platform: '#2a3a54',
    platformRing: '#4f8ef7',
    platformRingInner: '#3b7ae8',
    platformGlow: '#7eb0ff',
    keyLight: '#ffffff',
    fillLight: '#64748b',
    fillGround: '#1e293b',
    rimLight: '#4f8ef7',
    accentPurple: '#4f8ef7',
    labelBg: 'rgba(15, 23, 42, 0.85)',
    labelText: '#e8eaf6',
    labelName: '#7eb0ff',
    labelBorder: 'rgba(79, 142, 247, 0.35)',
  }),
  gray: p(light, {
    bg: '#b8bcc4',
    fog: '#a8acb4',
    floor: '#a0a4ac',
    floorGrid: '#888c94',
    floorGridSection: '#787c84',
    floorAccent: '#9ca3af',
    carpet: '#6b7280',
    platform: '#c0c4cc',
    platformRing: '#9ca3af',
    platformRingInner: '#6b7280',
    platformGlow: '#d1d5db',
    fillLight: '#b0b4bc',
    rimLight: '#9ca3af',
    accentPurple: '#6b7280',
    labelName: '#4b5563',
    labelBorder: 'rgba(107, 114, 128, 0.35)',
  }),
};

export function getThemePalette(themeId: string): ScenePalette {
  return THEME_PALETTES[themeId] || THEME_PALETTES.light;
}