/* Team Office — UI, chat, tabs, bridge to 3D/2D scene */
const HUB_API = (window.__HUB_API__ || '').replace(/\/$/, '');
let hubToken = (window.__HUB_TOKEN__ || '').trim();
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
let activeAgentThread = null;
let agentsMeta = {};
let chats = [];
let chatPendingDelete = null;
let unreadByChat = {};
let markReadTimer = null;
const CHAT_STORAGE_KEY = 'office_active_chat_id';
const THEME_STORAGE_KEY = 'office_theme';
const CHAT_COLLAPSED_KEY = 'office_chat_collapsed';
const MOBILE_TAB_ORDER = ['office', 'chat', 'team'];

let chatCollapsed = false;
let chatDrawerOpen = false;

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

function isMessageForActiveThread(m) {
  if (!m || !isEventForActiveChat(m)) return false;
  const ta = m.target_agent || null;
  if (activeAgentThread) return ta === activeAgentThread;
  return ta == null;
}

function saveActiveChatId(id) {
  activeChatId = id;
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, String(id));
  } catch (_) {}
}

function canRenameActiveChat() {
  return Boolean(activeChatId && getActiveChat() && !activeAgentThread);
}

function updateRenameControls() {
  const editable = canRenameActiveChat();
  const title = $('#chat-title');
  const btn = $('#btn-rename-chat');
  const btnM = $('#btn-rename-chat-m');
  if (title) {
    title.classList.toggle('chat-title-editable', editable);
    title.tabIndex = editable ? 0 : -1;
    title.setAttribute('role', editable ? 'button' : 'heading');
    title.title = editable ? 'Нажмите, чтобы переименовать' : '';
  }
  [btn, btnM].forEach((el) => {
    if (!el) return;
    el.disabled = !editable;
    el.classList.toggle('hidden', !editable);
  });
}

function updateChatHeader() {
  const chat = getActiveChat();
  const title = $('#chat-title');
  const folder = $('#chat-folder-path');
  const changeBtn = $('#btn-change-folder');
  if (title) {
    if (activeAgentThread) {
      const meta = agentsMeta[activeAgentThread] || {};
      title.textContent = `${meta.emoji || '💬'} ${meta.name || activeAgentThread}`;
      title.style.color = meta.color || '';
    } else {
      title.textContent = chat?.name || 'Обсуждение';
      title.style.color = '';
    }
  }
  if (folder) {
    folder.textContent = chat?.folder_path || 'Папка не выбрана';
    folder.title = chat?.folder_path || '';
  }
  if (changeBtn) {
    const editable = Boolean(activeChatId && !activeAgentThread);
    changeBtn.disabled = !editable;
    changeBtn.classList.toggle('hidden', !editable);
  }
  updateRenameControls();
}

function showRenameChatModal() {
  if (!canRenameActiveChat()) return;
  const chat = getActiveChat();
  const input = $('#rename-chat-input');
  if (input) {
    input.value = chat?.name || '';
  }
  $('#rename-chat-modal')?.classList.remove('hidden');
  requestAnimationFrame(() => {
    input?.focus();
    input?.select();
  });
}

function hideRenameChatModal() {
  $('#rename-chat-modal')?.classList.add('hidden');
}

async function confirmRenameChat() {
  const name = $('#rename-chat-input')?.value?.trim();
  if (!name) {
    alert('Введите название чата.');
    return;
  }
  if (!activeChatId) return;
  const btn = $('#btn-confirm-rename-chat');
  if (btn) btn.disabled = true;
  try {
    const res = await api(`/api/chats/${activeChatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    const idx = chats.findIndex((c) => c.id === activeChatId);
    if (idx >= 0) chats[idx] = res.chat;
    hideRenameChatModal();
    renderChatList();
  } catch (e) {
    alert(e.message || 'Не удалось переименовать чат');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderAgentThreadPills() {
  const container = $('#agent-thread-pills');
  if (!container) return;
  container.innerHTML = AGENT_ORDER.map((id) => {
    const a = agentsMeta[id] || {};
    const active = id === activeAgentThread;
    return `<button type="button" class="agent-thread-pill${active ? ' active' : ''}" data-agent-thread="${id}" style="--accent:${a.color || '#64748b'}">${a.emoji || '•'} ${esc(a.name || id)}</button>`;
  }).join('');
  container.querySelectorAll('[data-agent-thread]').forEach((btn) => {
    btn.addEventListener('click', () => openAgentChat(btn.dataset.agentThread));
  });
  renderUnreadBadges();
}

function updateAgentThreadUI() {
  const bar = $('#agent-thread-bar');
  const summonBtn = $('#btn-summon');
  const inputEl = $('#chat-input');
  if (activeAgentThread) {
    bar?.classList.remove('hidden');
    renderAgentThreadPills();
    if (inputEl) {
      const meta = agentsMeta[activeAgentThread] || {};
      inputEl.placeholder = `Поручение для ${meta.name || activeAgentThread}…`;
    }
    summonBtn?.classList.add('hidden');
  } else {
    bar?.classList.add('hidden');
    if (inputEl) inputEl.placeholder = 'Напишите задачу команде…';
    summonBtn?.classList.remove('hidden');
  }
  updateChatHeader();
  document.querySelectorAll('[data-team-card]').forEach((card) => {
    card.classList.toggle('active-thread', card.dataset.teamCard === activeAgentThread);
  });
}

function openAgentChat(agentId) {
  if (!WORK_AGENTS.has(agentId)) return;
  activeAgentThread = agentId;
  if (sceneApi?.focusAgent) sceneApi.focusAgent(agentId);
  if (isDesktopLayout() && chatCollapsed) openChatDrawer();
  setMobileTab('chat');
  updateAgentThreadUI();
  historyLoaded = false;
  loadHistory().then(() => {
    historyLoaded = true;
    input?.focus();
    scheduleMarkActiveThreadRead();
  });
}

function closeAgentChat() {
  if (!activeAgentThread) return;
  activeAgentThread = null;
  updateAgentThreadUI();
  historyLoaded = false;
  loadHistory().then(() => {
    historyLoaded = true;
    scheduleMarkActiveThreadRead();
  });
}

function wireSceneAgentClicks() {
  if (sceneApi?.setAgentDeskClickHandler) {
    sceneApi.setAgentDeskClickHandler((id) => openAgentChat(id));
  }
}

function getUnreadForChat(chatId) {
  return unreadByChat[String(chatId)] || { team: 0, agents: {}, total: 0 };
}

function getActiveChatUnread() {
  return getUnreadForChat(activeChatId);
}

function formatUnreadBadge(n) {
  if (!n || n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

function ensureUnreadBadge(parent, className = 'unread-badge') {
  let badge = parent.querySelector(`.${className}`);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = className;
    parent.appendChild(badge);
  }
  return badge;
}

function setBadgeCount(el, n, className = 'unread-badge') {
  if (!el) return;
  const badge = ensureUnreadBadge(el, className);
  badge.textContent = formatUnreadBadge(n);
  badge.classList.toggle('hidden', !n);
}

async function loadUnread() {
  try {
    const res = await api('/api/unread');
    unreadByChat = res.by_chat || {};
    renderUnreadBadges();
  } catch (_) {}
}

async function markThreadRead(chatId, targetAgent) {
  if (!chatId) return;
  try {
    const res = await api('/api/read', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chatId, target_agent: targetAgent || null }),
    });
    unreadByChat = res.by_chat || unreadByChat;
    renderUnreadBadges();
  } catch (_) {}
}

function isChatFeedVisible() {
  if (isDesktopLayout()) return !chatCollapsed || chatDrawerOpen;
  return getActiveMobileTab() === 'chat';
}

function isViewingThread(chatId, targetAgent) {
  const ta = targetAgent || null;
  if (activeChatId !== chatId) return false;
  if ((activeAgentThread || null) !== ta) return false;
  return isChatFeedVisible();
}

function markActiveThreadRead() {
  if (!activeChatId || !isChatFeedVisible()) return;
  markThreadRead(activeChatId, activeAgentThread);
}

function scheduleMarkActiveThreadRead() {
  clearTimeout(markReadTimer);
  markReadTimer = setTimeout(() => markActiveThreadRead(), 200);
}

function bumpUnreadLocal(m) {
  if (!m || m.chat_id == null) return;
  const cid = String(m.chat_id);
  if (!unreadByChat[cid]) unreadByChat[cid] = { team: 0, agents: {}, total: 0 };
  const entry = unreadByChat[cid];
  const ta = m.target_agent || null;
  if (ta) entry.agents[ta] = (entry.agents[ta] || 0) + 1;
  else entry.team = (entry.team || 0) + 1;
  entry.total = (entry.total || 0) + 1;
  renderUnreadBadges();
}

function renderUnreadBadges() {
  document.querySelectorAll('.chat-list-item[data-chat-id]').forEach((btn) => {
    const n = getUnreadForChat(Number(btn.dataset.chatId)).total;
    setBadgeCount(btn, n);
  });

  const active = getActiveChatUnread();
  document.querySelectorAll('[data-team-card]').forEach((card) => {
    setBadgeCount(card, active.agents?.[card.dataset.teamCard] || 0);
  });

  document.querySelectorAll('[data-agent-thread]').forEach((btn) => {
    setBadgeCount(btn, active.agents?.[btn.dataset.agentThread] || 0);
  });

  const chatUnread = active.team || 0;
  const teamUnread = AGENT_ORDER.reduce((s, id) => s + (active.agents?.[id] || 0), 0);
  setBadgeCount(document.querySelector('.mobile-tabs .tab[data-tab="chat"]'), chatUnread, 'unread-badge tab-unread-badge');
  setBadgeCount(document.querySelector('.mobile-tabs .tab[data-tab="team"]'), teamUnread, 'unread-badge tab-unread-badge');

  const fab = $('#chat-fab');
  if (fab) {
    let totalAll = 0;
    Object.values(unreadByChat).forEach((e) => {
      totalAll += e.total || 0;
    });
    setBadgeCount(fab, totalAll);
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
  renderUnreadBadges();
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
  await loadUnread();
}

async function selectChat(id) {
  if (!id) return;
  const changing = id !== activeChatId;
  if (changing) {
    saveActiveChatId(id);
    activeAgentThread = null;
    updateAgentThreadUI();
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
  scheduleMarkActiveThreadRead();
}

function showNewChatModal() {
  $('#new-chat-name').value = '';
  $('#new-chat-folder').value = '';
  updateFolderPathHints();
  $('#new-chat-modal')?.classList.remove('hidden');
}

function hideNewChatModal() {
  $('#new-chat-modal')?.classList.add('hidden');
  setBrowseStatus('');
}

function resolveFolderPathInput(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  return normalizeFolderPath(trimmed) || trimmed;
}

async function createChat() {
  const name = $('#new-chat-name')?.value?.trim();
  const folder_path = resolveFolderPathInput($('#new-chat-folder')?.value);
  if (!name || !folder_path) {
    setBrowseStatus('Укажите название и путь к папке', true);
    return;
  }
  try {
    const res = await api('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ name, folder_path }),
    });
    chats.push(res.chat);
    await selectChat(res.chat.id);
    hideNewChatModal();
  } catch (e) {
    setBrowseStatus(e.message || 'Не удалось создать чат', true);
  }
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

function setChangeFolderStatus(text, isError = false) {
  const el = $('#change-folder-status');
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

async function browseFolder(targetInputId = 'new-chat-folder', statusFn = setBrowseStatus) {
  if (IS_CLOUD_MODE) {
    statusFn('Обзор доступен только при локальном запуске (launch-office.bat). Введите путь вручную.', true);
    return;
  }
  const btn = targetInputId === 'change-folder-input' ? $('#btn-browse-folder-change') : $('#btn-browse-folder');
  if (btn) btn.disabled = true;
  statusFn('Выберите папку в окне Windows…');
  try {
    const res = await api('/api/pick-folder', { method: 'POST', body: '{}' });
    if (res.cancelled) {
      statusFn('');
      return;
    }
    if (res.path) {
      const input = $(`#${targetInputId}`);
      if (input) input.value = res.path;
      statusFn('');
    }
  } catch (e) {
    statusFn(e.message || 'Не удалось открыть обзор', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showChangeFolderModal() {
  if (!activeChatId || activeAgentThread) return;
  const chat = getActiveChat();
  const input = $('#change-folder-input');
  if (input) input.value = chat?.folder_path || '';
  setChangeFolderStatus('');
  updateFolderPathHints();
  $('#change-folder-modal')?.classList.remove('hidden');
}

function hideChangeFolderModal() {
  $('#change-folder-modal')?.classList.add('hidden');
  setChangeFolderStatus('');
}

async function confirmChangeFolder() {
  if (!activeChatId || activeAgentThread) return;
  const folder_path = resolveFolderPathInput($('#change-folder-input')?.value);
  if (!folder_path) {
    setChangeFolderStatus('Укажите путь к папке', true);
    return;
  }
  try {
    await bindFolderToActiveChat(folder_path);
    hideChangeFolderModal();
  } catch (e) {
    setChangeFolderStatus(e.message || 'Не удалось сохранить путь', true);
  }
}

function updateFolderPathHints() {
  const cloudHint =
    'В облаке введите полный путь вручную (например C:\\Users\\USER\\проект). Обзор и drag-drop работают при launch-office.bat.';
  const localHint = 'Перетащите папку из Проводника или введите путь вручную.';
  const hint = IS_CLOUD_MODE ? cloudHint : localHint;
  const newHint = $('#new-chat-folder-hint');
  const changeHint = $('#change-folder-hint');
  if (newHint) newHint.textContent = hint;
  if (changeHint) changeHint.textContent = hint;
  document.body.classList.toggle('folder-drop-cloud', IS_CLOUD_MODE);
  const browseBtns = [$('#btn-browse-folder'), $('#btn-browse-folder-change')];
  browseBtns.forEach((btn) => {
    if (!btn) return;
    btn.disabled = IS_CLOUD_MODE;
    btn.title = IS_CLOUD_MODE
      ? 'Обзор только при локальном запуске (launch-office.bat)'
      : 'Выбрать папку в Проводнике';
  });
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
      activeAgentThread = null;
      updateAgentThreadUI();
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

function fileUriToPath(uri) {
  if (!uri) return '';
  const line = uri.trim().split(/\r?\n/).find((l) => l && !l.startsWith('#')) || '';
  if (!line.startsWith('file://')) return '';
  let p = decodeURIComponent(line.replace(/^file:\/\//i, ''));
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
  p = p.replace(/\//g, '\\');
  if (/^[A-Za-z]:\\/.test(p) || p.startsWith('\\\\')) return p;
  return '';
}

function normalizeFolderPath(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/^["']|["']$/g, '');
  if (s.startsWith('file://')) return fileUriToPath(s);
  s = s.replace(/\//g, '\\');
  if (/^[A-Za-z]:\\/.test(s) || s.startsWith('\\\\')) return s;
  return '';
}

function suggestNameFromPath(path) {
  const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || 'Мой проект';
}

function isPhotoOnlyDrag(dt) {
  const files = [...(dt?.files || [])];
  return files.length > 0 && files.every((f) => f.type.startsWith('image/'));
}

function hasFolderDragPayload(dt) {
  if (!dt) return false;
  const types = [...(dt.types || [])];
  if (types.includes('text/plain') || types.includes('text/uri-list') || types.includes('URL')) return true;
  if (types.includes('Files') && !isPhotoOnlyDrag(dt)) return true;
  return false;
}

async function extractFolderPathFromDataTransfer(dt) {
  if (!dt) return '';

  const plain = dt.getData('text/plain') || dt.getData('text') || '';
  let path = normalizeFolderPath(plain);
  if (path) return path;

  const uriList = dt.getData('text/uri-list') || dt.getData('URL') || '';
  for (const line of uriList.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    path = fileUriToPath(line) || normalizeFolderPath(line);
    if (path) return path;
  }

  if (isPhotoOnlyDrag(dt)) return '';

  const files = [...(dt.files || [])];
  for (const f of files) {
    if (f.path) {
      path = normalizeFolderPath(f.path);
      if (path) return path;
    }
  }

  const items = [...(dt.items || [])];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      const f = item.getAsFile();
      if (f?.path) {
        path = normalizeFolderPath(f.path);
        if (path) return path;
      }
    }
  }

  return '';
}

function setFolderDropStatus(text, isError = false) {
  const el = $('#folder-drop-status');
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

async function bindFolderToActiveChat(folderPath) {
  if (!activeChatId) return;
  if (activeAgentThread) {
    alert('В личном чате агента папку не меняют. Нажмите «← Команда».');
    return;
  }
  const res = await api(`/api/chats/${activeChatId}`, {
    method: 'PATCH',
    body: JSON.stringify({ folder_path: folderPath }),
  });
  const idx = chats.findIndex((c) => c.id === activeChatId);
  if (idx >= 0) chats[idx] = res.chat;
  updateChatHeader();
  renderChatList();
  setFolderDropStatus(`Папка привязана: ${shortPath(folderPath)}`);
  setTimeout(() => setFolderDropStatus(''), 4000);
}

function prefillNewChatFolder(path) {
  showNewChatModal();
  const folderInput = $('#new-chat-folder');
  const nameInput = $('#new-chat-name');
  if (folderInput) folderInput.value = path;
  if (nameInput && !nameInput.value.trim()) nameInput.value = suggestNameFromPath(path);
}

async function handleFolderDrop(path, zone) {
  if (!path) {
    const msg = IS_CLOUD_MODE
      ? 'Не удалось прочитать путь из перетаскивания. Нажмите «Путь» и введите вручную, например C:\\Users\\USER\\проект'
      : 'Не удалось прочитать путь. Перетащите папку из Проводника Windows или нажмите «Обзор…».';
    alert(msg);
    return;
  }

  if (zone === 'change-folder') {
    const input = $('#change-folder-input');
    if (input) input.value = path;
    setChangeFolderStatus('');
    return;
  }

  if (zone === 'sidebar' || zone === 'new-chat') {
    prefillNewChatFolder(path);
    return;
  }

  if (zone === 'chat') {
    try {
      await bindFolderToActiveChat(path);
    } catch (e) {
      setFolderDropStatus(e.message || 'Не удалось привязать папку', true);
      setTimeout(() => setFolderDropStatus(''), 5000);
    }
  }
}

function initFolderDropZone(el, zone) {
  if (!el) return;
  el.classList.add('folder-drop-target');
  let depth = 0;

  const activate = () => el.classList.add('folder-drop-active');
  const deactivate = () => {
    depth = 0;
    el.classList.remove('folder-drop-active');
  };

  el.addEventListener('dragenter', (e) => {
    if (!hasFolderDragPayload(e.dataTransfer)) return;
    e.preventDefault();
    depth += 1;
    activate();
  });

  el.addEventListener('dragleave', () => {
    depth -= 1;
    if (depth <= 0) deactivate();
  });

  el.addEventListener('dragover', (e) => {
    if (!hasFolderDragPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  el.addEventListener('drop', async (e) => {
    if (!hasFolderDragPayload(e.dataTransfer)) return;
    e.preventDefault();
    deactivate();
    const path = await extractFolderPathFromDataTransfer(e.dataTransfer);
    await handleFolderDrop(path, zone);
  });
}

function initFolderDropZones() {
  initFolderDropZone($('#chat-main-drop'), 'chat');
  initFolderDropZone($('#chat-sidebar'), 'sidebar');
  initFolderDropZone($('#new-chat-folder-drop'), 'new-chat');
  initFolderDropZone($('#change-folder-drop'), 'change-folder');
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
    card.addEventListener('click', () => openAgentChat(card.dataset.teamCard));
  });
  renderUnreadBadges();
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

async function ensureHubToken() {
  if (hubToken) return hubToken;
  if (IS_CLOUD_MODE) return hubToken;
  try {
    const res = await fetch(hubUrl('/api/office/ws-token'));
    if (res.ok) {
      const data = await res.json();
      hubToken = (data.token || '').trim();
    }
  } catch (_) {}
  return hubToken;
}

function hubHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (hubToken) h['X-Hub-Token'] = hubToken;
  return h;
}

function formatApiError(status, raw) {
  let msg = raw || `HTTP ${status}`;
  try {
    const j = JSON.parse(raw);
    if (j.detail) {
      msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    }
  } catch (_) {}
  if (status === 401 && /hub token/i.test(msg)) {
    return IS_CLOUD_MODE
      ? 'Неверный токен. Обновите страницу (Ctrl+F5). Если не поможет — HUB_TOKEN на GitHub и Railway должен совпадать.'
      : 'Неверный токен. Перезапустите launch-office.bat.';
  }
  return msg;
}

async function api(path, opts = {}) {
  await ensureHubToken();
  const r = await fetch(hubUrl(path), {
    ...opts,
    headers: { ...hubHeaders(), ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const raw = await r.text();
    throw new Error(formatApiError(r.status, raw));
  }
  return r.json();
}

async function loadHistory() {
  if (!activeChatId) return;
  let url = `/api/messages?chat_id=${activeChatId}&limit=60`;
  if (activeAgentThread) url += `&target_agent=${encodeURIComponent(activeAgentThread)}`;
  else url += '&channel=team';
  const { messages } = await api(url);
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
  agentsMeta = agents || {};
  renderTeamCards(agentsMeta);
  renderAgentThreadPills();
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
  await ensureHubToken();
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  if (hubToken) headers['X-Hub-Token'] = hubToken;
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
    if (activeAgentThread) {
      await api(`/api/agents/${activeAgentThread}/task`, {
        method: 'POST',
        body: JSON.stringify({
          text,
          source: 'office',
          attachments,
          chat_id: activeChatId,
        }),
      });
    } else {
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
    }
    scheduleMarkActiveThreadRead();
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
    wireSceneAgentClicks();
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
      wireSceneAgentClicks();
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
  if (tab === 'chat') scheduleMarkActiveThreadRead();
}

function getActiveMobileTab() {
  const el = document.querySelector('.mobile-tabs .tab.active');
  return el?.dataset.tab || 'office';
}

function stepMobileTab(dir) {
  const idx = MOBILE_TAB_ORDER.indexOf(getActiveMobileTab());
  if (idx < 0) return;
  const next = idx + dir;
  if (next >= 0 && next < MOBILE_TAB_ORDER.length) setMobileTab(MOBILE_TAB_ORDER[next]);
}

function isDesktopLayout() {
  return window.matchMedia('(min-width: 1024px)').matches;
}

function updateTopbarOffset() {
  const main = $('.main-layout');
  if (!main) return;
  document.documentElement.style.setProperty('--topbar-offset', `${main.getBoundingClientRect().top}px`);
}

function applyChatCollapseUI() {
  const layout = $('.main-layout');
  const fab = $('#chat-fab');
  const backdrop = $('#chat-drawer-backdrop');
  const btn = $('#btn-toggle-chat');
  if (!layout) return;

  if (!isDesktopLayout()) {
    layout.classList.remove('chat-collapsed', 'chat-drawer-open');
    fab?.classList.add('hidden');
    backdrop?.classList.add('hidden');
    backdrop?.classList.remove('visible');
    if (btn) btn.textContent = 'Свернуть чат';
    return;
  }

  layout.classList.toggle('chat-collapsed', chatCollapsed);
  layout.classList.toggle('chat-drawer-open', chatCollapsed && chatDrawerOpen);

  if (chatCollapsed) {
    updateTopbarOffset();
    fab?.classList.toggle('hidden', chatDrawerOpen);
    backdrop?.classList.toggle('hidden', !chatDrawerOpen);
    backdrop?.classList.toggle('visible', chatDrawerOpen);
    if (btn) btn.textContent = chatDrawerOpen ? 'Скрыть чат' : 'Развернуть';
  } else {
    fab?.classList.add('hidden');
    backdrop?.classList.add('hidden');
    backdrop?.classList.remove('visible');
    chatDrawerOpen = false;
    if (btn) btn.textContent = 'Свернуть чат';
  }

  if (chatCollapsed && chatDrawerOpen) {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
  }
}

function setChatCollapsed(collapsed, { openDrawer = false } = {}) {
  chatCollapsed = collapsed;
  chatDrawerOpen = collapsed && openDrawer;
  try {
    localStorage.setItem(CHAT_COLLAPSED_KEY, chatCollapsed ? '1' : '0');
  } catch (_) {}
  applyChatCollapseUI();
}

function openChatDrawer() {
  if (!chatCollapsed || !isDesktopLayout()) return;
  chatDrawerOpen = true;
  applyChatCollapseUI();
  scheduleMarkActiveThreadRead();
}

function closeChatDrawer() {
  if (!chatDrawerOpen) return;
  chatDrawerOpen = false;
  applyChatCollapseUI();
}

function bindHorizontalSwipe(el, handlers) {
  if (!el) return;
  let x0 = null;
  let y0 = null;

  const onEnd = (clientX, clientY) => {
    if (x0 == null) return;
    const dx = clientX - x0;
    const dy = clientY - y0;
    x0 = null;
    y0 = null;
    if (Math.abs(dx) < 52 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) handlers.onSwipeLeft?.();
    else handlers.onSwipeRight?.();
  };

  el.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    },
    { passive: true }
  );
  el.addEventListener(
    'touchend',
    (e) => {
      if (x0 == null) return;
      onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    },
    { passive: true }
  );
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    x0 = e.clientX;
    y0 = e.clientY;
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse' || x0 == null) return;
    onEnd(e.clientX, e.clientY);
  });
}

function initChatCollapse() {
  try {
    chatCollapsed = localStorage.getItem(CHAT_COLLAPSED_KEY) === '1';
  } catch (_) {}

  $('#btn-toggle-chat')?.addEventListener('click', () => {
    if (!isDesktopLayout()) return;
    if (!chatCollapsed) {
      setChatCollapsed(true);
      return;
    }
    if (chatDrawerOpen) {
      closeChatDrawer();
      return;
    }
    setChatCollapsed(false);
  });

  $('#chat-fab')?.addEventListener('click', () => openChatDrawer());
  $('#chat-drawer-backdrop')?.addEventListener('click', () => closeChatDrawer());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatDrawerOpen) closeChatDrawer();
  });

  bindHorizontalSwipe($('#office-viewport'), {
    onSwipeLeft: () => {
      if (isDesktopLayout() && chatCollapsed && !chatDrawerOpen) openChatDrawer();
    },
  });

  bindHorizontalSwipe($('#panel-chat'), {
    onSwipeRight: () => {
      if (isDesktopLayout() && chatCollapsed && chatDrawerOpen) closeChatDrawer();
    },
  });

  applyChatCollapseUI();
}

function initMobileTabSwipe() {
  const layout = $('.main-layout');
  if (!layout) return;

  let x0 = null;
  let y0 = null;
  let tracking = false;

  const shouldIgnoreSwipeTarget = (target) => {
    if (!target?.closest) return false;
    return !!target.closest(
      'canvas, textarea, input, select, button, .chat-feed, .modal, .chat-form, .question-actions'
    );
  };

  layout.addEventListener(
    'touchstart',
    (e) => {
      if (!window.matchMedia('(max-width: 1023px)').matches) return;
      if (e.touches.length !== 1) return;
      if (shouldIgnoreSwipeTarget(e.target)) return;
      if (e.target.closest('#office-3d, #office-2d, #office-viewport') && !e.target.closest('#office-swipe-edge')) {
        return;
      }
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      tracking = true;
    },
    { passive: true }
  );

  layout.addEventListener(
    'touchend',
    (e) => {
      if (!tracking || x0 == null) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      y0 = null;
      if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      if (dx < 0) stepMobileTab(1);
      else stepMobileTab(-1);
    },
    { passive: true }
  );

  bindHorizontalSwipe($('#office-swipe-edge'), {
    onSwipeLeft: () => {
      if (window.matchMedia('(max-width: 1023px)').matches && getActiveMobileTab() === 'office') {
        setMobileTab('chat');
      }
    },
    onSwipeRight: () => {
      if (window.matchMedia('(max-width: 1023px)').matches && getActiveMobileTab() === 'chat') {
        setMobileTab('office');
      }
    },
  });
}

document.querySelectorAll('.mobile-tabs .tab').forEach((btn) => {
  btn.addEventListener('click', () => setMobileTab(btn.dataset.tab));
});

function initMobileLayout() {
  const isMobile = window.matchMedia('(max-width: 1023px)').matches;
  if (isMobile) setMobileTab(getActiveMobileTab() || 'office');
  else {
    document.querySelectorAll('.panel[data-panel]').forEach((p) => p.classList.add('active'));
  }
  applyChatCollapseUI();
  updateTopbarOffset();
}
initMobileLayout();
initChatCollapse();
initMobileTabSwipe();
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

async function connectWs() {
  const base = HUB_API || `${location.protocol}//${location.host}`;
  const wsBase = base.replace(/^http/, 'ws');
  const token = await ensureHubToken();
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
      if (event.type === 'message') {
        const m = event.data;
        if (isViewingThread(m.chat_id, m.target_agent || null)) {
          renderMessage(m, { live: true });
          scheduleMarkActiveThreadRead();
        } else {
          bumpUnreadLocal(m);
        }
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
    s.src = staticUrl('scene/office-scene.js?v=32');
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
  updateFolderPathHints();
  initFolderDropZones();
  loadChats()
    .then(() => loadAgents())
    .then(() => loadHistory())
    .then(() => {
      historyLoaded = true;
      scheduleMarkActiveThreadRead();
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
        wireSceneAgentClicks();
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

$('#btn-agent-thread-back')?.addEventListener('click', () => closeAgentChat());

$('#btn-rename-chat')?.addEventListener('click', () => showRenameChatModal());
$('#btn-rename-chat-m')?.addEventListener('click', () => showRenameChatModal());
$('#chat-title')?.addEventListener('click', () => {
  if (canRenameActiveChat()) showRenameChatModal();
});
$('#chat-title')?.addEventListener('keydown', (e) => {
  if (!canRenameActiveChat()) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    showRenameChatModal();
  }
});
$('#btn-confirm-rename-chat')?.addEventListener('click', () => confirmRenameChat());
$('#btn-cancel-rename-chat')?.addEventListener('click', hideRenameChatModal);
$('#rename-chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmRenameChat();
  }
  if (e.key === 'Escape') hideRenameChatModal();
});

$('#btn-new-chat')?.addEventListener('click', showNewChatModal);
$('#btn-new-chat-m')?.addEventListener('click', showNewChatModal);
$('#btn-cancel-chat')?.addEventListener('click', hideNewChatModal);
$('#btn-create-chat')?.addEventListener('click', () => createChat());
$('#btn-browse-folder')?.addEventListener('click', () => browseFolder());
$('#btn-browse-folder-change')?.addEventListener('click', () => browseFolder('change-folder-input', setChangeFolderStatus));
$('#btn-change-folder')?.addEventListener('click', () => showChangeFolderModal());
$('#btn-confirm-change-folder')?.addEventListener('click', () => confirmChangeFolder());
$('#btn-cancel-change-folder')?.addEventListener('click', hideChangeFolderModal);
$('#change-folder-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmChangeFolder();
  }
  if (e.key === 'Escape') hideChangeFolderModal();
});
$('#chat-folder-path')?.addEventListener('click', () => {
  if (activeChatId && !activeAgentThread) showChangeFolderModal();
});
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