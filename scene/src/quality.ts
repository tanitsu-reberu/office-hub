import type { QualityTier } from './constants';

export type PostFxMode = 'full' | 'selective' | 'off';

export interface QualityProfile {
  dpr: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  exposure: number;
  postfx: PostFxMode;
  n8ao: boolean;
  selectiveBloom: boolean;
  bloomIntensity: number;
  physicalMaterials: boolean;
  innerPlatformRing: boolean;
  envPreset: 'city' | 'warehouse' | 'apartment';
  envIntensity: number;
  fog: boolean;
}

const PROFILES: Record<QualityTier, QualityProfile> = {
  high: {
    dpr: Math.min(window.devicePixelRatio, 1.2),
    antialias: false,
    shadows: true,
    shadowMapSize: 512,
    exposure: 1.18,
    postfx: 'selective',
    n8ao: false,
    selectiveBloom: true,
    bloomIntensity: 0.55,
    physicalMaterials: true,
    innerPlatformRing: true,
    envPreset: 'apartment',
    envIntensity: 0.46,
    fog: true,
  },
  medium: {
    dpr: 1,
    antialias: false,
    shadows: true,
    shadowMapSize: 512,
    exposure: 1.12,
    postfx: 'off',
    n8ao: false,
    selectiveBloom: false,
    bloomIntensity: 0,
    physicalMaterials: false,
    innerPlatformRing: false,
    envPreset: 'apartment',
    envIntensity: 0.42,
    fog: true,
  },
  low: {
    dpr: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    exposure: 1.02,
    postfx: 'off',
    n8ao: false,
    selectiveBloom: false,
    bloomIntensity: 0,
    physicalMaterials: false,
    innerPlatformRing: false,
    envPreset: 'city',
    envIntensity: 0.34,
    fog: false,
  },
};

function isIntegratedGpu(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    if (!gl) return true;
    const dbg = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return false;
    const renderer = String(
      (gl as WebGLRenderingContext).getParameter(dbg.UNMASKED_RENDERER_WEBGL)
    ).toLowerCase();
    return /intel|uhd|iris|hd graphics|radeon vega|basic render/.test(renderer);
  } catch {
    return true;
  }
}

export function detectQualityTier(): QualityTier {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get('gfx');
  if (forced === 'high' || forced === 'medium' || forced === 'low') {
    return forced;
  }

  try {
    const saved = localStorage.getItem('office_gfx');
    if (saved === 'low' || saved === 'medium') return saved;
  } catch {
    /* ignore */
  }

  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile) return 'low';

  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const weakGpu = isIntegratedGpu();

  if (weakGpu) {
    return cores >= 8 ? 'medium' : 'low';
  }
  if (cores >= 10 && mem >= 8) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

export function getQualityProfile(tier: QualityTier): QualityProfile {
  return PROFILES[tier];
}