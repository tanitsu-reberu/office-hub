/**
 * 2D isometric fallback when WebGL unavailable.
 */
window.Office2D = (function () {
  const AGENTS = {
    orchestrator: { name: 'Оркестратор', emoji: '🎯', color: '#8b5cf6', x: 50, y: 22 },
    designer: { name: 'Дизайнер', emoji: '🎨', color: '#ec4899', x: 22, y: 42 },
    frontend: { name: 'Фронтенд', emoji: '⚡', color: '#06b6d4', x: 78, y: 42 },
    backend: { name: 'Бэкенд', emoji: '🔧', color: '#22c55e', x: 22, y: 68 },
    owencloud: { name: 'OwenCloud', emoji: '🏭', color: '#f59e0b', x: 78, y: 68 },
  };

  let host, agents = {}, notifyStack, onAgentDeskClick = null;

  function buildDOM() {
    host.innerHTML = `
      <div class="iso-floor">
        <div class="iso-table"></div>
        <div class="iso-room iso-user-room" style="left:50%;top:86%">
          <div class="iso-desk"></div>
          <span class="iso-label">👤 Вы · Заказчик</span>
        </div>
        ${Object.entries(AGENTS)
          .map(
            ([id, a]) => `
          <div class="iso-room" data-room="${id}" style="left:${a.x}%;top:${a.y}%">
            <div class="iso-desk"></div>
            <div class="iso-monitor" style="--accent:${a.color}"></div>
            <span class="iso-label">${a.name}</span>
          </div>
          <div class="iso-agent" data-agent="${id}" style="left:${a.x}%;top:${a.y + 8}%;--accent:${a.color}">
            <span class="iso-emoji">${a.emoji}</span>
          </div>`
          )
          .join('')}
      </div>`;

    Object.keys(AGENTS).forEach((id) => {
      agents[id] = {
        el: host.querySelector(`[data-agent="${id}"]`),
        room: host.querySelector(`[data-room="${id}"]`),
        home: { x: AGENTS[id].x, y: AGENTS[id].y + 8 },
        meta: AGENTS[id],
      };
    });

    host.querySelectorAll('[data-room]').forEach((room) => {
      room.addEventListener('click', () => {
        const id = room.dataset.room;
        if (id && onAgentDeskClick) onAgentDeskClick(id);
      });
    });
  }

  function moveAgent(id, x, y) {
    const a = agents[id];
    if (!a) return;
    a.el.style.left = x + '%';
    a.el.style.top = y + '%';
  }

  function goHome(id) {
    const a = agents[id];
    if (!a) return;
    moveAgent(id, a.home.x, a.home.y);
  }

  function pushToast(meta, text) {
    if (window.Office3D?.pushTopNotification) {
      Office3D.pushTopNotification(meta, text);
      return;
    }
    if (!notifyStack) return;
    const el = document.createElement('div');
    el.className = 'notify-toast show';
    el.style.borderLeftColor = meta.color || '#8b5cf6';
    el.innerHTML = `<span class="notify-emoji">${meta.emoji || '💬'}</span><div class="notify-body"><strong>${meta.name}</strong><p>${text.slice(0, 100)}</p></div>`;
    notifyStack.prepend(el);
    setTimeout(() => el.remove(), 5000);
  }

  function init(el, labelsEl, notifyEl) {
    host = el;
    notifyStack = notifyEl;
    host.classList.remove('hidden');
    buildDOM();
    return true;
  }

  function gatherAtMeeting() {
    const spots = {
      orchestrator: [50, 38],
      designer: [38, 48],
      frontend: [62, 48],
      backend: [38, 58],
      owencloud: [62, 58],
    };
    Object.entries(spots).forEach(([id, [x, y]]) => moveAgent(id, x, y));
  }

  function scatterToDesks() {
    Object.keys(agents).forEach(goHome);
  }

  function onMessage(agentId, text, meta) {
    const a = agents[agentId];
    if (!a) return;
    a.el.classList.add('typing');
    a.room?.classList.add('active');
    pushToast(
      { name: meta?.agent_name || a.meta.name, emoji: meta?.emoji || a.meta.emoji, color: meta?.color || a.meta.color },
      text
    );
    setTimeout(() => {
      a.el.classList.remove('typing');
      a.room?.classList.remove('active');
    }, 5000);
  }

  function onStatus(agentId, status) {
    const a = agents[agentId];
    if (!a) return;
    if (status === 'thinking' || status === 'working') {
      a.el.classList.add('typing');
      goHome(agentId);
    } else if (status === 'idle') {
      a.el.classList.remove('typing');
    }
  }

  function focusAgent(id) {
    const a = agents[id];
    if (!a) return;
    a.room?.classList.add('focused');
    setTimeout(() => a.room?.classList.remove('focused'), 2000);
  }

  function resetCamera() {}

  function setAgentDeskClickHandler(fn) {
    onAgentDeskClick = typeof fn === 'function' ? fn : null;
  }

  function clearNotifications() {
    if (notifyStack) notifyStack.innerHTML = '';
    window.Office3D?.clearNotifications?.();
  }

  return {
    init,
    gatherAtMeeting,
    scatterToDesks,
    onMessage,
    onStatus,
    focusAgent,
    resetCamera,
    setAgentDeskClickHandler,
    clearNotifications,
  };
})();