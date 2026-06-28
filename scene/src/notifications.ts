export interface NotifyMeta {
  name?: string;
  emoji?: string;
  color?: string;
  agent_name?: string;
}

const MAX_TOAST = 2;

let notifyStack: HTMLElement | null = null;
const toastQueue: Array<{ meta: NotifyMeta; text: string }> = [];
let toastVisible = 0;

function escapeHtml(s: string) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function showToastNow(meta: NotifyMeta, text: string) {
  if (!notifyStack) return;
  toastVisible += 1;
  const el = document.createElement('div');
  el.className = 'notify-toast';
  el.style.borderLeftColor = meta.color || '#8b5cf6';
  const short = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  el.innerHTML = `
    <span class="notify-emoji">${meta.emoji || '💬'}</span>
    <div class="notify-body">
      <strong style="color:${meta.color}">${escapeHtml(meta.name || meta.agent_name || 'Агент')}</strong>
      <span>печатает…</span>
      <p>${escapeHtml(short)}</p>
    </div>
  `;
  notifyStack.prepend(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => {
      el.remove();
      toastVisible = Math.max(0, toastVisible - 1);
      flushToastQueue();
    }, 400);
  }, 5500);
}

function flushToastQueue() {
  while (toastVisible < MAX_TOAST && toastQueue.length > 0) {
    const item = toastQueue.shift()!;
    showToastNow(item.meta, item.text);
  }
}

export function bindNotifyStack(el: HTMLElement | null) {
  notifyStack = el;
}

export function pushTopNotification(meta: NotifyMeta, text: string) {
  if (toastVisible < MAX_TOAST) showToastNow(meta, text);
  else toastQueue.push({ meta, text });
  if (toastQueue.length > 8) toastQueue.shift();
}

export function clearNotifications() {
  if (notifyStack) notifyStack.innerHTML = '';
  toastQueue.length = 0;
  toastVisible = 0;
}