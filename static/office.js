/* Team Office — UI, chat, tabs, bridge to 3D/2D scene */
const HUB_API = (window.__HUB_API__ || '').replace(/\/$/, '');
const HUB_TOKEN = window.__HUB_TOKEN__ || '';
const IS_CLOUD_MODE = Boolean(HUB_API);
const CLOUD_BANNER_KEY = 'office_cloud_banner_dismissed';
const IS_APP_MODE = new URLSearchParams(location.search).get('app') === '1';

const MAX_PHOTOS = 7;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
let pendingPhotos = [];
let photoObjectUrls = [];
let activeQuestion = null;
let activeAction = null;
let activeSession = null;
let activeSessionProposal = null;
let sessionCountdownTimer = null;
let activeChatId = null;
let chats = [];
let chatPendingDelete = null;
const CHAT_STORAGE_KEY = 'office_active_chat_id';
const THEME_STORAGE_KEY = 'office_theme';

function getCurrentTheme() {
  return document.documentElement.dataset.theme || window.OFFICE_THEMES?.default || 'light';
}

function applyTheme(id) {
  const themes = window.OFFICE_THEMES;
  const valid = themes?.list?.some((t) => t.id === id);
  const themeId = valid ? id : themes?.default || 'light';
  document.documentElement.dataset.theme = themeId;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch (_) {}
  const meta = document.querySelector('meta[name="theme-color"]');
  const item = themes?.list?.find((t) => t.id === themeId);
  if (meta && item?.themeColor) meta.content = item.themeColor;
  window.dispatchEvent(new CustomEvent('office-theme-change', { detail: { themeId } }));
  document.querySelectorAll('.theme-card').forEach((c) => {
    c.classList.toggle('active', c.dataset.themeId === themeId);
  });
}

function renderThemeCards() {
  const container = $('#theme-cards');
  const themes = window.OFFICE_THEMES;
  if (!container || !themes?.list) return;
  const current = getCurrentTheme();
  container.innerHTML = themes.list
    .map(
      (t) => `
    <div class="theme-card${t.id === current ? ' active' : ''}" data-theme-id="${t.id}" role="button" tabindex="0">
      <div class="theme-card-dots">${t.preview.map((c) => `<span class="theme-card-dot" style="background:${c}"></span>`).join('')}</div>
      <div class="theme-card-name">${esc(t.name)}</div>
      <div class="theme-card-desc">${esc(t.desc)}</div>
    </div>`
    )
    .join('');
  container.querySelectorAll('[data-theme-id]').forEach((card) => {
    card.addEventListener('click', () => applyTheme(card.dataset.themeId));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        applyTheme(card.dataset.themeId);
      }
    });
  });
}

function showThemeModal() {
  renderThemeCards();
  $('#theme-modal')?.classList.remove('hidden');
}

function hideThemeModal() {
  $('#theme-modal')?.classList.add('hidden');
}

function syncThemeMeta() {
  const themes = window.OFFICE_THEMES;
  if (!themes?.list) return;
  const item = themes.list.find((t) => t.id === getCurrentTheme());
  if (item?.themeColor) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = item.themeColor;
  }
}

const WORK_AGENTS = new Set(['orchestrator', 'designer', 'frontend', 'backend', 'owencloud']);
const AGENT_ORDER = ['orchestrator', 'designer', 'frontend', 'backend', 'owencloud'];

const $ = (sel) => document.querySelector(sel);
const feed = $('#chat-feed');
const form = $('#chat-form');
const input = $('#chat-input');
const connDot = $('#conn-dot');
const connLabel = $('#conn-label');
const teamCards = $('#team-cards');
const activeTaskEl = $('#active-task');
const loader = $('#office-loader');

let sceneApi = null;
let statusMap = {};
let historyLoaded = false;

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function mediaUrl(url) {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return hubUrl(url.startsWith('/') ? url : `/${url}`);
}

function staticUrl(path) {
  const el = document.querySelector('script[src*="office.js"]');
  if (el) {
    const src = el.getAttribute('src') || 'static/office.js';
    const base = src.replace(/office\.js.*$/, '');
    return `${base}${path}`;
  }
  const prefix = (window.__HUB_BASE__ || '').replace(/\/$/, '');
  return `${prefix}/static/${path}`;
}

function attachmentHtml(attachments) {
  if (!attachments?.length) return '';
  const items = attachments
    .map(
      (a) =>
        `<a href="${esc(mediaUrl(a.url))}" target="_blank" rel="noopener" class="msg-photo-link"><img src="${esc(mediaUrl(a.url))}" alt="${esc(a.name || 'photo')}" class="msg-photo" loading="lazy" /></a>`
    )
    .join('');
  if (attachments.length === 1) return items;
  return `<div class="msg-photos-grid">${items}</div>`;
}

function shortPath(path) {
  if (!path) return '';
  if (path.length <= 28) return path;
  return '…' + path.slice(-26);
}

function getActiveChat() {
  return chats.find((c) => c.id === activeChatId) || null;
}

function isEventForActiveChat(data) {
  if (!data || data.chat_id == null) return true;
  return data.chat_id === activeChatId;
}

function saveActiveChatId(id) {
  activeChatId = id;
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, String(id));
  } catch (_) {}
}

function updateChatHeader() {
  const chat = getActiveChat();
  const title = $('#chat-title');
  const folder = $('#chat-folder-path');
  if (title) title.textContent = chat?.name || 'Обсуждение';
  if (folder) {
    folder.textContent = chat?.folder_path || 'Папка не выбрана';
    folder.title = chat?.folder_path || '';
  }
}

function canDeleteChats() {
  return chats.length > 1;
}

function updateDeleteButtons() {
  const enabled = canDeleteChats();
  const btn = $('#btn-delete-chat');
  if (btn) btn.disabled = !enabled;
  document.querySelectorAll('.chat-delete-btn').forEach((b) => {
    b.disabled = !enabled;
  });
}

function renderChatList() {
  const list = $('#chat-list');
  const select = $('#chat-select-mobile');
  const deletable = canDeleteChats();
  if (list) {
    list.innerHTML = chats
      .map(
        (c) => `
      <li class="chat-list-row">
        <button type="button" class="chat-list-item${c.id === activeChatId ? ' active' : ''}" data-chat-id="${c.id}">
          ${esc(c.name)}
          <span class="chat-item-path">${esc(shortPath(c.folder_path))}</span>
        </button>
        <button type="button" class="chat-delete-btn" data-delete-chat="${c.id}" title="Удалить чат" ${deletable ? '' : 'disabled'}>✕</button>
      </li>`
      )
      .join('');
    list.querySelectorAll('[data-chat-id]').forEach((btn) => {
      btn.addEventListener('click', () => selectChat(Number(btn.dataset.chatId)));
    });
    list.querySelectorAll('[data-delete-chat]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptDeleteChat(Number(btn.dataset.deleteChat));
      });
    });
  }
  if (select) {
    select.innerHTML = chats
      .map((c) => `<option value="${c.id}"${c.id === activeChatId ? ' selected' : ''}>${esc(c.name)}</option>`)
      .join('');
  }
  updateChatHeader();
  updateDeleteButtons();
}

async function loadChats() {
  const res = await api('/api/chats');
  chats = res.chats || [];
  if (!chats.length) return;
  let stored = null;
  try {
    stored = Number(localStorage.getItem(CHAT_STORAGE_KEY));
  } catch (_) {}
  const valid = chats.some((c) => c.id === stored);
  saveActiveChatId(valid ? stored : chats[0].id);
  renderChatList();
}

async function selectChat(id) {
  if (!id || id === activeChatId) return;
  saveActiveChatId(id);
  renderChatList();
  hideActiveTask();
  hideQuestionModal();
  hideActionModal();
  hideSessionModal();
  stopSessionCountdown();
  historyLoaded = false;
  await loadHistory();
  historyLoaded = true;
  await loadPendingQuestion();
  await loadPendingAction();
  await loadPendingSession();
  await loadActiveSession();
}

function showNewChatModal() {
  $('#new-chat-name').value = '';
  $('#new-chat-folder').value = '';
  $('#new-chat-modal')?.classList.remove('hidden');
}

function hideNewChatModal() {
  $('#new-chat-modal')?.classList.add('hidden');
  setBrowseStatus('');
}

async function createChat() {
  const name = $('#new-chat-name')?.value?.trim();
  const folder_path = $('#new-chat-folder')?.value?.trim();
  if (!name || !folder_path) return;
  const res = await api('/api/chats', {
    method: 'POST',
    body: JSON.stringify({ name, folder_path }),
  });
  chats.push(res.chat);
  await selectChat(res.chat.id);
  hideNewChatModal();
}

function setBrowseStatus(text, isError = false) {
  const el = $('#browse-folder-status');
  if (!el) return;
  if (!text) {
    el.classList.add('hidden');
    el.textContent = '';
    el.classList.remove('error');
    return;
  }
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('error', isError);
}

async function browseFolder() {
  const btn = $('#btn-browse-folder');
  if (btn) btn.disabled = true;
  setBrowseStatus('Выберите папку в окне Windows…');
  try {
    const res = await api('/api/pick-folder', { method: 'POST', body: '{}' });
    if (res.cancelled) {
      setBrowseStatus('');
      return;
    }
    if (res.path) {
      $('#new-chat-folder').value = res.path;
      setBrowseStatus('');
    }
  } catch (e) {
    setBrowseStatus(e.message || 'Не удалось открыть обзор', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function promptDeleteChat(id) {
  if (!canDeleteChats()) {
    alert('Нельзя удалить последний чат.');
    return;
  }
  const chat = chats.find((c) => c.id === id);
  if (!chat) return;
  chatPendingDelete = chat;
  const nameEl = $('#delete-chat-name');
  if (nameEl) nameEl.textContent = chat.name;
  $('#delete-chat-modal')?.classList.remove('hidden');
}

function hideDeleteChatModal() {
  chatPendingDelete = null;
  $('#delete-chat-modal')?.classList.add('hidden');
}

async function confirmDeleteChat() {
  if (!chatPendingDelete) return;
  const id = chatPendingDelete.id;
  try {
    await api(`/api/chats/${id}`, { method: 'DELETE' });
    chats = chats.filter((c) => c.id !== id);
    hideDeleteChatModal();
    if (activeChatId === id) {
      saveActiveChatId(chats[0]?.id);
      feed.innerHTML = '';
      hideActiveTask();
      hideQuestionModal();
      historyLoaded = false;
      if (chats[0]) {
        await loadHistory();
        historyLoaded = true;
        await loadPendingQuestion();
      }
    }
    renderChatList();
  } catch (e) {
    alert(e.message || 'Не удалось удалить чат');
  }
}

async function openActiveFolder() {
  if (!activeChatId) return;
  try {
    const res = await api(`/api/chats/${activeChatId}/open-folder`, { method: 'POST', body: '{}' });
    if (!res.opened_with && res.hint) alert(res.hint);
  } catch (e) {
    alert('Не удалось открыть папку. Скопируйте путь из шапки чата.');
  }
}

function renderMessage(m, opts = {}) {
  const live = opts.live === true;
  const div = document.createElement('div');
  div.className = `msg msg-${m.agent}`;
  div.innerHTML = `
    <div class="msg-head">
      <span>${m.emoji}</span>
      <span class="name" style="color:${m.color}">${esc(m.agent_name)}</span>
      <span class="time">${formatTime(m.created_at)}</span>
    </div>
    <p class="msg-text">${esc(m.text)}</p>
    ${attachmentHtml(m.attachments)}
  `;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;

  if (live && WORK_AGENTS.has(m.agent) && sceneApi) {
    sceneApi.onMessage(m.agent, m.text, m);
  }
}

function applyStatus(s) {
  statusMap[s.agent] = s;
  const pill = document.querySelector(`[data-status-agent="${s.agent}"]`);
  if (pill) {
    pill.textContent = s.status;
    pill.className = `status-pill ${s.status}`;
  }
  const card = document.querySelector(`[data-team-card="${s.agent}"]`);
  if (card) card.style.setProperty('--accent', s.color);

  if (WORK_AGENTS.has(s.agent) && sceneApi && historyLoaded) {
    sceneApi.onStatus(s.agent, s.status);
  }
}

function renderTeamCards(agentsMeta) {
  teamCards.innerHTML = AGENT_ORDER.map((id) => {
    const a = agentsMeta[id] || {};
    const st = statusMap[id]?.status || 'idle';
    return `
      <div class="team-card" data-team-card="${id}" style="--accent:${a.color || '#64748b'}">
        <span class="emoji">${a.emoji || '•'}</span>
        <div class="info">
          <strong style="color:${a.color}">${esc(a.name || id)}</strong>
          <span class="status-pill ${st}" data-status-agent="${id}">${st}</span>
        </div>
      </div>`;
  }).join('');

  teamCards.querySelectorAll('.team-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.teamCard;
      if (sceneApi?.focusAgent) sceneApi.focusAgent(id);
      setMobileTab('office');
    });
  });
}

function showActiveTask(taskId, text) {
  activeTaskEl.classList.remove('hidden');
  activeTaskEl.innerHTML = `<strong>Задача #${esc(taskId)}</strong> — ожидает ответа в Cursor. «${esc(text.slice(0, 80))}»`;
}

function hideActiveTask() {
  activeTaskEl.classList.add('hidden');
}

function hubUrl(path) {
  return HUB_API ? `${HUB_API}${path}` : path;
}

function hubHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (HUB_TOKEN) h['X-Hub-Token'] = HUB_TOKEN;
  return h;
}

async function api(path, opts = {}) {
  const r = await fetch(hubUrl(path), {
    ...opts,
    headers: { ...hubHeaders(), ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const raw = await r.text();
    let msg = raw || `HTTP ${r.status}`;
    try {
      const j = JSON.parse(raw);
      if (j.detail) {
        msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
      }
    } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

async function loadHistory() {
  if (!activeChatId) return;
  const { messages } = await api(`/api/messages?chat_id=${activeChatId}&limit=60`);
  feed.innerHTML = '';
  messages.forEach((m) => renderMessage(m, { live: false }));
  historyLoaded = true;
}

async function loadStatuses() {
  const { statuses } = await api('/api/status');
  statuses.forEach((s) => {
    statusMap[s.agent] = s;
    const pill = document.querySelector(`[data-status-agent="${s.agent}"]`);
    if (pill) {
      pill.textContent = s.status;
      pill.className = `status-pill ${s.status}`;
    }
  });
}

async function loadAgents() {
  const { agents } = await api('/api/agents');
  renderTeamCards(agents);
}

async function summonTeam() {
  const text = input.value.trim() || 'Новая задача для команды';
  input.value = '';
  if (sceneApi) sceneApi.gatherAtMeeting();
  const res = await api('/api/team/summon', {
    method: 'POST',
    body: JSON.stringify({ text, source: 'office', chat_id: activeChatId }),
  });
  if (res.task_id) showActiveTask(res.task_id, text);
}

function updatePhotoButtonLabel() {
  const btn = $('#btn-photo');
  if (!btn) return;
  btn.textContent = pendingPhotos.length
    ? `📎 Фото (${pendingPhotos.length}/${MAX_PHOTOS})`
    : '📎 Фото';
}

function validatePhotoFile(file) {
  if (!file.type.startsWith('image/')) return `«${file.name}»: только изображения`;
  if (file.size > MAX_PHOTO_BYTES) return `«${file.name}»: макс. 5 МБ`;
  return null;
}

function revokePhotoUrls() {
  photoObjectUrls.forEach((u) => URL.revokeObjectURL(u));
  photoObjectUrls = [];
}

function renderPhotoPreview() {
  const prev = $('#photo-preview');
  if (!prev) return;
  if (!pendingPhotos.length) {
    prev.innerHTML = '';
    prev.classList.add('hidden');
    updatePhotoButtonLabel();
    return;
  }
  prev.classList.remove('hidden');
  revokePhotoUrls();
  const thumbs = pendingPhotos
    .map((file, i) => {
      const url = URL.createObjectURL(file);
      photoObjectUrls.push(url);
      return `<div class="photo-preview-item"><img src="${url}" alt="" /><button type="button" class="photo-preview-remove" data-photo-idx="${i}" aria-label="Убрать">✕</button></div>`;
    })
    .join('');
  prev.innerHTML = `
    <div class="photo-preview-grid">${thumbs}</div>
    <div class="photo-preview-actions">
      <span class="photo-upload-status" id="photo-upload-status"></span>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-photo-clear-all">Очистить</button>
    </div>`;
  prev.querySelectorAll('[data-photo-idx]').forEach((btn) => {
    btn.addEventListener('click', () => removePhotoAt(Number(btn.dataset.photoIdx)));
  });
  $('#btn-photo-clear-all')?.addEventListener('click', clearPhotoPreview);
  updatePhotoButtonLabel();
}

function removePhotoAt(index) {
  pendingPhotos.splice(index, 1);
  renderPhotoPreview();
}

function addPhotos(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const errors = [];
  let dropped = 0;
  for (const file of files) {
    if (pendingPhotos.length >= MAX_PHOTOS) {
      dropped += 1;
      continue;
    }
    const err = validatePhotoFile(file);
    if (err) {
      errors.push(err);
      continue;
    }
    const dup = pendingPhotos.some((p) => p.name === file.name && p.size === file.size);
    if (!dup) pendingPhotos.push(file);
  }
  renderPhotoPreview();
  if (dropped) alert(`Максимум ${MAX_PHOTOS} фото. Лишние не добавлены.`);
  if (errors.length) alert(errors.join('\n'));
}

function clearPhotoPreview() {
  pendingPhotos = [];
  revokePhotoUrls();
  const prev = $('#photo-preview');
  if (prev) {
    prev.innerHTML = '';
    prev.classList.add('hidden');
  }
  const inp = $('#chat-photo');
  if (inp) inp.value = '';
  updatePhotoButtonLabel();
}

function setPhotoUploadStatus(text) {
  const el = $('#photo-upload-status');
  if (el) el.textContent = text || '';
}

async function uploadPhoto(file) {
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  if (HUB_TOKEN) headers['X-Hub-Token'] = HUB_TOKEN;
  const r = await fetch(hubUrl('/api/uploads'), { method: 'POST', headers, body: fd });
  if (!r.ok) {
    const raw = await r.text();
    let msg = raw;
    try {
      const j = JSON.parse(raw);
      if (j.detail) msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

$('#btn-photo')?.addEventListener('click', () => {
  if (pendingPhotos.length >= MAX_PHOTOS) {
    alert(`Максимум ${MAX_PHOTOS} фото.`);
    return;
  }
  $('#chat-photo')?.click();
});
$('#chat-photo')?.addEventListener('change', (e) => {
  addPhotos(e.target.files);
  e.target.value = '';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text && !pendingPhotos.length) return;

  const submitBtn = form.querySelector('[type="submit"]');
  const photoBtn = $('#btn-photo');
  if (submitBtn) submitBtn.disabled = true;
  if (photoBtn) photoBtn.disabled = true;

  let attachments = null;
  try {
    if (pendingPhotos.length) {
      setPhotoUploadStatus(`Загрузка ${pendingPhotos.length} фото…`);
      const uploads = await Promise.all(pendingPhotos.map((f) => uploadPhoto(f)));
      attachments = uploads.map((up) => ({ url: up.url, name: up.name }));
    }
    input.value = '';
    clearPhotoPreview();
    await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        text,
        agent: 'user',
        source: 'office',
        attachments,
        chat_id: activeChatId,
      }),
    });
  } catch (err) {
    setPhotoUploadStatus('');
    alert(err.message || 'Не удалось отправить');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (photoBtn) photoBtn.disabled = false;
    setPhotoUploadStatus('');
  }
});

['btn-summon', 'btn-summon-team'].forEach((id) => {
  $(`#${id}`)?.addEventListener('click', () => summonTeam());
});

function bindMeetingDesks() {
  const meeting = () => sceneApi?.gatherAtMeeting();
  const desks = () => sceneApi?.scatterToDesks();
  ['btn-meeting', 'btn-meeting-d'].forEach((id) => $(`#${id}`)?.addEventListener('click', meeting));
  ['btn-desks', 'btn-desks-d'].forEach((id) => $(`#${id}`)?.addEventListener('click', desks));
}
bindMeetingDesks();

$('#btn-reset-cam')?.addEventListener('click', () => sceneApi?.resetCamera?.());

function is2DMode() {
  const label = $('#render-mode-badge')?.textContent || '';
  return label.includes('2D') || sceneApi === window.Office2D;
}

function updateGfxButtons() {
  const ecoBtn = $('#btn-eco');
  if (!ecoBtn) return;
  if (is2DMode()) {
    ecoBtn.textContent = 'Вернуть 3D';
    ecoBtn.title = 'Переключить на 3D офис';
  } else {
    ecoBtn.textContent = 'Эко 2D';
    ecoBtn.title = '2D режим — почти не грузит GPU';
  }
}

async function switchToEco2D() {
  try {
    localStorage.setItem('office_gfx', 'low');
  } catch (_) {}
  const host3d = $('#office-3d');
  const host2d = $('#office-2d');
  const labels = $('#head-labels');
  const notify = $('#notify-stack');
  sceneApi?.destroy?.();
  sceneApi = null;
  const api2d = window.Office2D;
  if (!api2d?.init) return;
  const ok = await trySceneEngine(api2d, host3d, host2d, labels, notify, {
    label: '2D Эко',
    use2d: true,
    waitReady: false,
  });
  if (ok) {
    sceneApi = api2d;
    setRenderMode('2D Эко · без GPU');
    updateGfxButtons();
  }
}

async function switchTo3D() {
  try {
    localStorage.removeItem('office_gfx');
  } catch (_) {}
  const host3d = $('#office-3d');
  const host2d = $('#office-2d');
  const labels = $('#head-labels');
  const notify = $('#notify-stack');
  sceneApi?.destroy?.();
  sceneApi = null;
  if (loader) {
    loader.classList.remove('hidden', 'done');
    setLoaderText('Загрузка 3D…');
  }
  const engines = await buildSceneEngines(false);
  for (const engine of engines) {
    const api = engine.api();
    if (!api) continue;
    const ok = await trySceneEngine(api, host3d, host2d, labels, notify, engine);
    if (ok) {
      sceneApi = api;
      let modeLabel = engine.label;
      if (engine.waitReady && typeof api.getGfxTier === 'function') {
        const tier = api.getGfxTier();
        if (tier) modeLabel = `${engine.label} · ${tier}`;
      }
      setRenderMode(modeLabel);
      hideLoader();
      updateGfxButtons();
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      return;
    }
  }
  hideLoader();
  alert('3D не загрузился. Обновите страницу (Ctrl+F5) или проверьте WebGL в браузере.');
  updateGfxButtons();
}

$('#btn-theme')?.addEventListener('click', showThemeModal);
$('#btn-theme-close')?.addEventListener('click', hideThemeModal);
$('#btn-eco')?.addEventListener('click', () => {
  if (is2DMode()) switchTo3D();
  else switchToEco2D();
});
$('#btn-clear-notify')?.addEventListener('click', () => sceneApi?.clearNotifications?.());

function setMobileTab(tab) {
  document.querySelectorAll('.panel[data-panel]').forEach((p) => {
    p.classList.toggle('active', p.dataset.panel === tab);
  });
  document.querySelectorAll('.mobile-tabs .tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  if (tab === 'office') setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
}

document.querySelectorAll('.mobile-tabs .tab').forEach((btn) => {
  btn.addEventListener('click', () => setMobileTab(btn.dataset.tab));
});

function initMobileLayout() {
  const isMobile = window.matchMedia('(max-width: 1023px)').matches;
  if (isMobile) setMobileTab('office');
  else {
    document.querySelectorAll('.panel[data-panel]').forEach((p) => p.classList.add('active'));
  }
}
initMobileLayout();
window.addEventListener('resize', initMobileLayout);

async function loadLanInfo() {
  try {
    const info = await api('/api/info');
    const box = $('#lan-urls');
    if (!box) return;
    box.innerHTML = (info.urls || [])
      .map(
        (u) => `
      <div class="lan-url">
        <span>${esc(u.label)}: <strong>${esc(u.url)}</strong></span>
        <button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(u.url)}">Копировать</button>
      </div>`
      )
      .join('');
    box.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigator.clipboard?.writeText(btn.dataset.copy);
        btn.textContent = 'OK';
        setTimeout(() => (btn.textContent = 'Копировать'), 1500);
      });
    });
  } catch (_) {}
}

$('#btn-lan')?.addEventListener('click', async () => {
  await loadLanInfo();
  $('#lan-modal')?.classList.remove('hidden');
});
$('#btn-lan-close')?.addEventListener('click', () => $('#lan-modal')?.classList.add('hidden'));

let wsHubToken = HUB_TOKEN;

async function ensureWsToken() {
  if (wsHubToken) return wsHubToken;
  try {
    const base = HUB_API || `${location.protocol}//${location.host}`;
    const res = await fetch(`${base}/api/office/ws-token`);
    if (res.ok) {
      const data = await res.json();
      wsHubToken = data.token || '';
    }
  } catch (_) {}
  return wsHubToken;
}

async function connectWs() {
  const base = HUB_API || `${location.protocol}//${location.host}`;
  const wsBase = base.replace(/^http/, 'ws');
  const token = await ensureWsToken();
  const tokenQ = token ? `?token=${encodeURIComponent(token)}` : '';
  const ws = new WebSocket(`${wsBase}/ws${tokenQ}`);

  ws.onopen = () => {
    connDot.className = 'conn-dot live';
    connLabel.textContent = 'live';
  };
  ws.onclose = () => {
    connDot.className = 'conn-dot';
    connLabel.textContent = 'переподключение…';
    setTimeout(connectWs, 2000);
  };
  ws.onmessage = (ev) => {
    try {
      const event = JSON.parse(ev.data);
      if (event.type === 'message' && isEventForActiveChat(event.data)) {
        renderMessage(event.data, { live: true });
      }
      if (event.type === 'status') applyStatus(event.data);
      if (event.type === 'team_summon' && isEventForActiveChat(event)) {
        if (sceneApi) sceneApi.gatherAtMeeting();
        if (event.task_id && event.text) showActiveTask(event.task_id, event.text);
      }
      if (event.type === 'question' && isEventForActiveChat(event.data)) {
        showQuestionModal(event.data);
      }
      if (event.type === 'question_answered' && sceneApi?.onQuestionAnswered) {
        sceneApi.onQuestionAnswered(event.data.agent);
        hideQuestionModal();
      }
      if (event.type === 'action_proposed' && isEventForActiveChat(event.data)) {
        if (!activeSession || activeSession.status !== 'active') {
          showActionModal(event.data);
        }
      }
      if (event.type === 'action_resolved' && isEventForActiveChat(event.data)) {
        if (event.data.status !== 'pending' && event.data.status !== 'running') {
          if (sceneApi?.onActionResolved && !activeSession) {
            sceneApi.onActionResolved(event.data.agent);
          }
          hideActionModal();
          if (activeSession && event.data.command) {
            flashSessionBanner(`Выполняется: ${event.data.command.slice(0, 48)}`);
          }
        }
      }
      if (event.type === 'session_proposed' && isEventForActiveChat(event.data)) {
        showSessionModal(event.data);
      }
      if (event.type === 'session_started' && isEventForActiveChat(event.data)) {
        setActiveSession(event.data);
        hideSessionModal();
      }
      if (
        (event.type === 'session_revoked' || event.type === 'session_expired') &&
        isEventForActiveChat(event.data)
      ) {
        clearActiveSession();
        hideSessionModal();
      }
    } catch (_) {}
  };
}

function showQuestionModal(q) {
  if (!q || !isEventForActiveChat(q)) return;
  activeQuestion = q;
  const modal = $('#question-modal');
  if (!modal) return;
  $('#q-emoji').textContent = q.emoji || '❓';
  $('#q-agent-name').textContent = q.agent_name || q.agent;
  $('#q-agent-name').style.color = q.color || '#8b5cf6';
  $('#q-text').textContent = q.text || '';
  const img = $('#q-image');
  if (q.image_url) {
    img.src = q.image_url;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    img.removeAttribute('src');
  }
  const opts = $('#q-options');
  opts.innerHTML = '';
  (q.options || []).forEach((label, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost q-option-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => submitQuestionAnswer({ option_index: i }));
    opts.appendChild(btn);
  });
  $('#q-answer-text').value = '';
  modal.classList.remove('hidden');
  if (sceneApi?.onQuestion) sceneApi.onQuestion(q.agent, q);
}

function hideQuestionModal() {
  activeQuestion = null;
  $('#question-modal')?.classList.add('hidden');
}

async function submitQuestionAnswer(body) {
  if (!activeQuestion) return;
  await api(`/api/questions/${activeQuestion.id}/answer`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  hideQuestionModal();
}

$('#q-submit')?.addEventListener('click', () => {
  const text = $('#q-answer-text')?.value?.trim();
  if (text) submitQuestionAnswer({ text });
});
$('#q-later')?.addEventListener('click', async () => {
  if (!activeQuestion) return hideQuestionModal();
  await api(`/api/questions/${activeQuestion.id}/dismiss`, { method: 'POST' });
  hideQuestionModal();
});

async function loadPendingQuestion() {
  if (!activeChatId) return;
  try {
    const { question } = await api(`/api/questions/pending?chat_id=${activeChatId}`);
    if (question) showQuestionModal(question);
  } catch (_) {}
}

function showActionModal(a) {
  if (!a || !isEventForActiveChat(a) || a.status !== 'pending') return;
  activeAction = a;
  const modal = $('#action-modal');
  if (!modal) return;
  $('#a-emoji').textContent = a.emoji || '⚙️';
  const nameEl = $('#a-agent-name');
  nameEl.textContent = a.agent_name || a.agent;
  nameEl.style.color = a.color || '#22c55e';
  const reasonEl = $('#a-reason');
  if (a.reason) {
    reasonEl.textContent = a.reason;
    reasonEl.classList.remove('hidden');
  } else {
    reasonEl.textContent = '';
    reasonEl.classList.add('hidden');
  }
  $('#a-command').textContent = a.command || '';
  modal.classList.remove('hidden');
  if (sceneApi?.onAction) sceneApi.onAction(a.agent, a);
}

function hideActionModal() {
  activeAction = null;
  $('#action-modal')?.classList.add('hidden');
}

async function approveAction() {
  if (!activeAction) return;
  const btn = $('#a-approve');
  if (btn) btn.disabled = true;
  try {
    await api(`/api/actions/${activeAction.id}/approve`, { method: 'POST' });
    hideActionModal();
  } catch (err) {
    alert(err.message || 'Не удалось выполнить команду');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function rejectAction() {
  if (!activeAction) return;
  await api(`/api/actions/${activeAction.id}/reject`, { method: 'POST' });
  hideActionModal();
}

$('#a-approve')?.addEventListener('click', () => approveAction());
$('#a-reject')?.addEventListener('click', () => rejectAction());

async function loadPendingAction() {
  if (!activeChatId) return;
  try {
    const { action } = await api(`/api/actions/pending?chat_id=${activeChatId}`);
    if (action && (!activeSession || activeSession.status !== 'active')) {
      showActionModal(action);
    }
  } catch (_) {}
}

function formatSessionCountdown(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateSessionBanner() {
  const banner = $('#session-banner');
  const text = $('#session-banner-text');
  const startBtn = $('#btn-session-start');
  if (!banner || !text) return;
  if (activeSession?.status === 'active' && activeSession.expires_at) {
    const left =
      activeSession.seconds_left ??
      Math.max(0, Math.floor((new Date(activeSession.expires_at) - Date.now()) / 1000));
    text.textContent = `Сессия активна · осталось ${formatSessionCountdown(left)}`;
    banner.classList.remove('hidden');
    if (startBtn) startBtn.disabled = true;
  } else {
    banner.classList.add('hidden');
    if (startBtn) startBtn.disabled = false;
  }
}

function flashSessionBanner(message) {
  const banner = $('#session-banner');
  const text = $('#session-banner-text');
  if (!banner || !text || activeSession?.status !== 'active') return;
  banner.classList.add('flash');
  text.textContent = message;
  setTimeout(() => updateSessionBanner(), 1800);
  setTimeout(() => banner?.classList.remove('flash'), 1800);
}

function stopSessionCountdown() {
  if (sessionCountdownTimer) {
    clearInterval(sessionCountdownTimer);
    sessionCountdownTimer = null;
  }
}

function startSessionCountdown() {
  stopSessionCountdown();
  if (!activeSession?.expires_at) return;
  sessionCountdownTimer = setInterval(() => {
    if (!activeSession?.expires_at) return stopSessionCountdown();
    const left = Math.max(0, Math.floor((new Date(activeSession.expires_at) - Date.now()) / 1000));
    activeSession.seconds_left = left;
    updateSessionBanner();
    if (left <= 0) {
      stopSessionCountdown();
      loadActiveSession();
    }
  }, 1000);
}

function setActiveSession(session) {
  activeSession = session?.status === 'active' ? session : null;
  updateSessionBanner();
  if (activeSession) startSessionCountdown();
  else stopSessionCountdown();
}

function clearActiveSession() {
  activeSession = null;
  updateSessionBanner();
  stopSessionCountdown();
}

async function loadActiveSession() {
  if (!activeChatId) return;
  try {
    const { session } = await api(`/api/sessions/active?chat_id=${activeChatId}`);
    setActiveSession(session);
  } catch (_) {
    clearActiveSession();
  }
}

function showSessionModal(s) {
  if (!s || !isEventForActiveChat(s) || s.status !== 'pending') return;
  activeSessionProposal = s;
  const modal = $('#session-modal');
  if (!modal) return;
  $('#s-emoji').textContent = s.emoji || '⏱️';
  const nameEl = $('#s-agent-name');
  nameEl.textContent = s.agent_name || s.agent;
  nameEl.style.color = s.color || '#22c55e';
  const reasonEl = $('#s-reason');
  if (s.reason) {
    reasonEl.textContent = s.reason;
    reasonEl.classList.remove('hidden');
  } else {
    reasonEl.textContent = '';
    reasonEl.classList.add('hidden');
  }
  modal.classList.remove('hidden');
  if (sceneApi?.onAction) sceneApi.onAction(s.agent, { command: 'Запрос сессии 15 мин', text: s.reason });
}

function hideSessionModal() {
  activeSessionProposal = null;
  $('#session-modal')?.classList.add('hidden');
}

async function approveSession() {
  if (!activeSessionProposal) return;
  await api(`/api/sessions/${activeSessionProposal.id}/approve`, { method: 'POST' });
  hideSessionModal();
  await loadActiveSession();
}

async function rejectSession() {
  if (!activeSessionProposal) return;
  await api(`/api/sessions/${activeSessionProposal.id}/reject`, { method: 'POST' });
  hideSessionModal();
}

async function startSession() {
  if (!activeChatId) return;
  const btn = $('#btn-session-start');
  if (btn) btn.disabled = true;
  try {
    const res = await api(`/api/chats/${activeChatId}/session/start`, { method: 'POST' });
    setActiveSession(res.session);
  } catch (err) {
    alert(err.message || 'Не удалось запустить сессию');
    if (btn) btn.disabled = false;
  }
}

async function revokeSession() {
  if (!activeSession?.id) return;
  await api(`/api/sessions/${activeSession.id}/revoke`, { method: 'POST' });
  clearActiveSession();
}

async function loadPendingSession() {
  if (!activeChatId) return;
  try {
    const { session } = await api(`/api/sessions/pending?chat_id=${activeChatId}`);
    if (session) showSessionModal(session);
  } catch (_) {}
}

$('#s-approve')?.addEventListener('click', () => approveSession());
$('#s-reject')?.addEventListener('click', () => rejectSession());
$('#btn-session-start')?.addEventListener('click', () => startSession());
$('#btn-session-kill')?.addEventListener('click', () => revokeSession());

function initAppMode() {
  if (!IS_APP_MODE) return;
  $('#app-mode-badge')?.classList.remove('hidden');
  document.querySelector('.lan-btn')?.classList.add('hidden');
}

function hideLoader() {
  if (loader) {
    loader.classList.add('done');
    setTimeout(() => loader.classList.add('hidden'), 500);
  }
}

function setLoaderText(text) {
  const p = loader?.querySelector('p');
  if (p) p.textContent = text;
}

let appServicesStarted = false;
let premiumLoadPromise = null;

function loadPremiumBundle() {
  if (window.Office3DR3F || window.Office3D) return Promise.resolve(true);
  if (premiumLoadPromise) return premiumLoadPromise;
  premiumLoadPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = staticUrl('scene/office-scene.js?v=26');
    s.async = true;
    s.onload = () => resolve(!!(window.Office3DR3F || window.Office3D));
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return premiumLoadPromise;
}

async function buildSceneEngines(include2d = true) {
  if (wantsEco2D()) {
    return [{ label: '2D Эко', api: () => window.Office2D, use2d: true, waitReady: false }];
  }

  const engines = [];
  if (new URLSearchParams(location.search).get('gfx') === 'high') {
    setLoaderText('Загрузка 3D Premium…');
    if (await loadPremiumBundle()) {
      engines.push({
        label: '3D Premium',
        api: () => window.Office3DR3F || window.Office3D,
        waitReady: true,
        readyTimeout: 25000,
      });
    }
  }

  engines.push({ label: '3D Classic', api: () => window.Office3DLegacy, waitReady: false });
  if (include2d) {
    engines.push({ label: '2D', api: () => window.Office2D, use2d: true, waitReady: false });
  }
  return engines;
}

function initCloudBanner() {
  if (!IS_CLOUD_MODE) return;
  const banner = $('#cloud-banner');
  if (!banner) return;
  try {
    if (localStorage.getItem(CLOUD_BANNER_KEY) === '1') return;
  } catch (_) {}
  banner.classList.remove('hidden');
  $('#btn-cloud-banner-close')?.addEventListener('click', () => {
    banner.classList.add('hidden');
    try {
      localStorage.setItem(CLOUD_BANNER_KEY, '1');
    } catch (_) {}
  });
}

function startAppServices() {
  if (appServicesStarted) return;
  appServicesStarted = true;
  initCloudBanner();
  loadChats()
    .then(() => loadAgents())
    .then(() => loadHistory())
    .then(() => {
      historyLoaded = true;
      return loadStatuses();
    })
    .then(() => loadPendingQuestion())
    .then(() => loadPendingAction())
    .then(() => loadPendingSession())
    .then(() => loadActiveSession());
  initAppMode();
  loadLanInfo();
  connectWs();
}

function setRenderMode(label) {
  const badge = $('#render-mode-badge');
  if (badge) badge.textContent = label;
}

function resetSceneHosts(host3d, host2d) {
  if (host3d) {
    host3d.innerHTML = '';
    host3d.classList.remove('hidden');
  }
  if (host2d) {
    host2d.innerHTML = '';
    host2d.classList.add('hidden');
  }
}

function is3DCanvasPresent() {
  const host = $('#office-3d');
  return !!(host && host.querySelector('canvas'));
}

function waitFor3DReady(timeoutMs = 8000) {
  if (window.__office3dReady || is3DCanvasPresent()) return Promise.resolve(true);

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      window.removeEventListener('office3d-ready', onReady);
      window.removeEventListener('office3d-error', onError);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(ok);
    };
    const onReady = () => finish(true);
    const onError = () => finish(false);
    const poll = setInterval(() => {
      if (window.__office3dReady || is3DCanvasPresent()) finish(true);
    }, 120);
    const timer = setTimeout(() => finish(is3DCanvasPresent()), timeoutMs);
    window.addEventListener('office3d-ready', onReady, { once: true });
    window.addEventListener('office3d-error', onError, { once: true });
  });
}

async function trySceneEngine(api, host3d, host2d, labels, notify, opts = {}) {
  if (!api?.init) return false;

  resetSceneHosts(host3d, host2d);
  if (opts.use2d) {
    host3d?.classList.add('hidden');
    host2d?.classList.remove('hidden');
  }

  const host = opts.use2d ? host2d : host3d;
  if (!host) return false;

  if (opts.waitReady) {
    window.__office3dReady = false;
    const readyPromise = waitFor3DReady(opts.readyTimeout ?? 8000);
    const ok = api.init(host, labels, notify);
    if (!ok) {
      api.destroy?.();
      return false;
    }
    const ready = await readyPromise;
    if (!ready) {
      api.destroy?.();
      return false;
    }
    return true;
  }

  const ok = api.init(host, labels, notify);
  if (!ok) {
    api.destroy?.();
    return false;
  }
  return true;
}

function wantsEco2D() {
  return new URLSearchParams(location.search).get('eco') === '1';
}

function bootScene() {
  const host3d = $('#office-3d');
  const host2d = $('#office-2d');
  const labels = $('#head-labels');
  const notify = $('#notify-stack');

  const start = async () => {
    if (!wantsEco2D()) setLoaderText('Загрузка 3D…');

    const engines = await buildSceneEngines(true);

    for (const engine of engines) {
      const api = engine.api();
      if (!api) continue;

      const ok = await trySceneEngine(api, host3d, host2d, labels, notify, engine);
      if (ok) {
        sceneApi = api;
        let modeLabel = engine.label;
        if (engine.waitReady && typeof api.getGfxTier === 'function') {
          const tier = api.getGfxTier();
          if (tier) modeLabel = `${engine.label} · ${tier}`;
        }
        if (engine.use2d) setRenderMode(wantsEco2D() ? '2D Эко · без GPU' : '2D');
        else setRenderMode(modeLabel);
        hideLoader();
        updateGfxButtons();
        startAppServices();
        return;
      }
    }

    setLoaderText('Не удалось загрузить офис (WebGL?). Ctrl+Shift+I → Console.');
    setRenderMode('ошибка');
    startAppServices();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(start));
  } else {
    requestAnimationFrame(start);
  }
}

$('#btn-new-chat')?.addEventListener('click', showNewChatModal);
$('#btn-new-chat-m')?.addEventListener('click', showNewChatModal);
$('#btn-cancel-chat')?.addEventListener('click', hideNewChatModal);
$('#btn-create-chat')?.addEventListener('click', () => createChat());
$('#btn-browse-folder')?.addEventListener('click', () => browseFolder());
$('#btn-open-folder')?.addEventListener('click', () => openActiveFolder());
$('#btn-delete-chat')?.addEventListener('click', () => {
  if (activeChatId) promptDeleteChat(activeChatId);
});
$('#btn-confirm-delete-chat')?.addEventListener('click', () => confirmDeleteChat());
$('#btn-cancel-delete-chat')?.addEventListener('click', hideDeleteChatModal);
$('#chat-select-mobile')?.addEventListener('change', (e) => {
  selectChat(Number(e.target.value));
});

syncThemeMeta();
bootScene();