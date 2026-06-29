/**
 * A3/G5 — WebGL + FPS smoke for Team Office 3D (Classic + Premium).
 * Usage: node scripts/smoke-3d.mjs [baseUrl]
 * Requires: local server at baseUrl (default http://127.0.0.1:8765)
 */
import { chromium } from '../scene/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import path from 'path';

const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8765';
const FPS_MS = 2500;

const MODES = [
  {
    name: 'Classic',
    query: '?gfx=low',
    badgeIncludes: 'Classic',
    minFps: 15,
    minFpsHeadless: 3,
    requireReady: false,
  },
  {
    name: 'Premium',
    query: '?gfx=high',
    badgeIncludes: 'Premium',
    minFps: 12,
    minFpsHeadless: 3,
    requireReady: true,
  },
];

async function probeMode(page, mode) {
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!/favicon|404|hub-config|websocket|live/i.test(t)) consoleErrors.push(t);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const url = `${BASE.replace(/\/$/, '')}/${mode.query}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  await page.waitForFunction(
    () => {
      const loader = document.getElementById('office-loader');
      if (!loader) return true;
      return loader.classList.contains('hidden') || getComputedStyle(loader).display === 'none';
    },
    { timeout: 35000 }
  );

  await page.waitForTimeout(800);

  const metrics = await page.evaluate(async (fpsMs) => {
    const badge = document.getElementById('render-mode-badge')?.textContent?.trim() || '';
    const canvas = document.querySelector('#office-3d canvas');
    const hasCanvas = !!canvas;
    let webgl = false;
    if (canvas) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      webgl = !!gl;
    }
    const ready = !!window.__office3dReady;
    const sceneError = !!document.querySelector('.office-3d-error');
    const headless = navigator.webdriver === true;

    let frames = 0;
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        frames += 1;
        if (performance.now() - t0 < fpsMs) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const fps = Math.round((frames / (fpsMs / 1000)) * 10) / 10;

    return { badge, hasCanvas, webgl, ready, sceneError, fps, headless };
  }, FPS_MS);

  return { ...metrics, consoleErrors, pageErrors };
}

function assertMode(mode, result) {
  const issues = [];
  const warnings = [];
  const headed = process.env.SMOKE_HEADED === '1';
  const minFps = headed ? mode.minFps : mode.minFpsHeadless;

  if (!result.badge.includes(mode.badgeIncludes)) {
    issues.push(`badge expected "${mode.badgeIncludes}", got "${result.badge}"`);
  }
  if (result.badge.includes('ошибка')) issues.push('render mode shows error');
  if (!result.hasCanvas) issues.push('no #office-3d canvas');
  if (!result.webgl) issues.push('WebGL context missing');
  if (result.sceneError) issues.push('.office-3d-error visible');
  if (mode.requireReady && !result.ready) issues.push('__office3dReady is false');
  if (result.fps < minFps) {
    const msg = `FPS ${result.fps} < ${minFps}`;
    if (headed) issues.push(msg);
    else warnings.push(`${msg} (headless — informational only)`);
  }
  if (result.pageErrors.length) issues.push(`page errors: ${result.pageErrors.join('; ')}`);
  const glErrors = result.consoleErrors.filter((e) =>
    /webgl|three|shader|context lost|office3d/i.test(e)
  );
  if (glErrors.length) issues.push(`console WebGL errors: ${glErrors.join('; ')}`);

  return { issues, warnings };
}

async function main() {
  let browser;
  const report = { base: BASE, modes: [], ok: true };

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

    for (const mode of MODES) {
      const page = await context.newPage();
      let result;
      try {
        result = await probeMode(page, mode);
      } catch (err) {
        result = {
          badge: '',
          hasCanvas: false,
          webgl: false,
          ready: false,
          sceneError: true,
          fps: 0,
          headless: true,
          consoleErrors: [],
          pageErrors: [String(err)],
        };
      }
      const { issues, warnings } = assertMode(mode, result);
      const pass = issues.length === 0;
      if (!pass) report.ok = false;
      report.modes.push({ mode: mode.name, pass, issues, warnings, ...result });
      await page.close();
      console.log(
        `${pass ? 'PASS' : 'FAIL'} ${mode.name}: fps=${result.fps} badge="${result.badge}" webgl=${result.webgl} ready=${result.ready}`
      );
      issues.forEach((i) => console.log(`  - ${i}`));
      warnings.forEach((w) => console.log(`  ! ${w}`));
    }
  } finally {
    await browser?.close();
  }

  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'smoke-3d-report.json');
  await import('fs').then(({ writeFileSync }) =>
    writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
  );
  console.log(`Report: ${outPath}`);

  if (!report.ok) process.exit(1);
  console.log('A3/G5 smoke: ALL PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});