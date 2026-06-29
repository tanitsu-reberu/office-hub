if (typeof globalThis.process === 'undefined') {
  (globalThis as typeof globalThis & { process: { env: { NODE_ENV: string } } }).process = {
    env: { NODE_ENV: 'production' },
  };
}

import { createRoot, Root } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { AGENTS } from './constants';
import { detectQualityTier } from './quality';
import { applyScenePalette, getInitialThemeId } from './theme/palette';
import { OfficeScene } from './OfficeScene';
import type { Office3DApi } from './bridge-api';
import { isAgentId } from './bridge-api';
import { setAgentDeskClickHandler as bindDeskClickHandler } from './deskClick';
import type { CameraRigHandle } from './components/CameraRig';
import { setLabelLayer } from './components/DomLabels';
import { bindNotifyStack, clearNotifications, pushTopNotification } from './notifications';
import { OfficeStore } from './state/officeStore';

let root: Root | null = null;
let store: OfficeStore | null = null;
let containerEl: HTMLElement | null = null;
export const globalCameraRef = { current: null as CameraRigHandle | null };

function SceneHost() {
  const camRef = useRef<CameraRigHandle | null>(null);
  const [themeId, setThemeId] = useState(getInitialThemeId);

  useEffect(() => {
    const onTheme = (ev: Event) => {
      const id = (ev as CustomEvent<{ themeId?: string }>).detail?.themeId || 'light';
      applyScenePalette(id);
      setThemeId(id);
    };
    window.addEventListener('office-theme-change', onTheme);
    return () => window.removeEventListener('office-theme-change', onTheme);
  }, []);

  if (!store) return null;

  return (
    <OfficeScene
      key={themeId}
      store={store}
      cameraRef={camRef}
      onCameraReady={(h) => {
        globalCameraRef.current = h;
      }}
    />
  );
}

function mountScene(el: HTMLElement) {
  store = new OfficeStore(AGENTS);
  root = createRoot(el);
  root.render(<SceneHost />);
}

function showInitError(el: HTMLElement, msg: string) {
  const box = document.createElement('div');
  box.className = 'office-3d-error';
  box.innerHTML = `<strong>3D офис не загрузился</strong><p>${msg}</p><p>Обновите страницу (Ctrl+F5). Чат справа работает.</p>`;
  el.appendChild(box);
}

const api: Office3DApi = {
  init(el, labelsEl, notifyEl) {
    try {
      containerEl = el;
      el.innerHTML = '';
      const host = document.createElement('div');
      host.className = 'office-canvas-host-inner';
      host.style.width = '100%';
      host.style.height = '100%';
      el.appendChild(host);
      setLabelLayer(labelsEl);
      bindNotifyStack(notifyEl);

      const onSceneError = (ev: Event) => {
        const msg = (ev as CustomEvent<{ message?: string }>).detail?.message || 'Ошибка рендера';
        showInitError(el, msg);
      };
      window.addEventListener('office3d-error', onSceneError);

      mountScene(host);
      return true;
    } catch (err) {
      console.error('Office3D R3F init failed:', err);
      showInitError(el, err instanceof Error ? err.message : String(err));
      return false;
    }
  },

  destroy() {
    root?.unmount();
    root = null;
    store = null;
    containerEl = null;
    globalCameraRef.current = null;
    setLabelLayer(null);
    window.__office3dReady = false;
  },

  gatherAtMeeting() {
    store?.gatherAtMeeting();
  },

  scatterToDesks() {
    store?.scatterToDesks();
  },

  onMessage(agentId, text, meta) {
    if (!isAgentId(agentId) || !store) return;
    const m = meta || store.getState().agents[agentId].meta;
    store.onMessage(agentId, text);
    pushTopNotification(
      {
        name: (m as { agent_name?: string }).agent_name || (m as { name?: string }).name,
        emoji: (m as { emoji?: string }).emoji,
        color: (m as { color?: string }).color,
      },
      text
    );
  },

  onStatus(agentId, status) {
    if (!isAgentId(agentId) || !store) return;
    store.onStatus(agentId, status);
  },

  goToDesk(id) {
    if (!isAgentId(id) || !store) return;
    store.goToDesk(id);
  },

  visitColleague(id) {
    if (!isAgentId(id) || !store) return;
    store.visitColleague(id);
  },

  pushTopNotification(meta, text) {
    pushTopNotification(meta, text);
  },

  clearNotifications() {
    clearNotifications();
  },

  resetCamera() {
    globalCameraRef.current?.reset();
  },

  focusAgent(id) {
    if (!isAgentId(id) || !store) return;
    globalCameraRef.current?.focusAgent(id);
    store.showBubble(id, `${store.getState().agents[id].meta.name} — кабинет`);
    setTimeout(() => store?.hideBubble(id), 5000);
  },

  setAgentDeskClickHandler(fn) {
    bindDeskClickHandler(
      fn
        ? (id) => {
            if (isAgentId(id)) fn(id);
          }
        : null
    );
  },

  onQuestion(agentId, payload) {
    if (!isAgentId(agentId) || !store) return;
    const text = String(payload.text || '');
    store.visitUser(agentId);
    store.showBubble(agentId, text);
    const meta = AGENTS[agentId];
    pushTopNotification({ name: meta.name, emoji: meta.emoji, color: meta.color }, text);
  },

  onQuestionAnswered(agentId) {
    if (!isAgentId(agentId) || !store) return;
    store.showBubble(agentId, 'Спасибо!');
    setTimeout(() => store?.leaveUser(agentId), 2200);
  },

  onAction(agentId, payload) {
    if (!isAgentId(agentId) || !store) return;
    const cmd = String(payload.command || '');
    const text = cmd ? `Команда: ${cmd.slice(0, 80)}` : 'Запрос на выполнение команды';
    store.visitUser(agentId);
    store.showBubble(agentId, text);
    const meta = AGENTS[agentId];
    pushTopNotification({ name: meta.name, emoji: meta.emoji, color: meta.color }, text);
  },

  onActionResolved(agentId) {
    if (!isAgentId(agentId) || !store) return;
    store.showBubble(agentId, 'Готово');
    setTimeout(() => store?.leaveUser(agentId), 2200);
  },

  getGfxTier() {
    return detectQualityTier();
  },
};

window.Office3DR3F = api;
window.Office3D = api;

export type { Office3DApi };
export default api;