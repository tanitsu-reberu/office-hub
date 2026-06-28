import { getThemePalette, type ScenePalette } from './palettes';

function clonePalette(src: ScenePalette): ScenePalette {
  return { ...src, emissive: { ...src.emissive } };
}

/** Mutable palette — updated via applyScenePalette on theme change */
export const palette: ScenePalette = clonePalette(getThemePalette('light'));

export function applyScenePalette(themeId: string): void {
  const next = getThemePalette(themeId);
  Object.assign(palette, next);
  Object.assign(palette.emissive, next.emissive);
}

export function getInitialThemeId(): string {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme || 'light';
}

applyScenePalette(getInitialThemeId());