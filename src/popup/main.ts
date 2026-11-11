// Popup: показує, куди буде збережено документ, і чи відкрито лист у Gmail.
// Етап 0: збереження ще не реалізоване, кнопка лише відображає стан.
import type { OpenedMessageInfo, Request } from '../shared/messages';
import { getSettings } from '../shared/storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusEl = $<HTMLParagraphElement>('status');
const pathEl = $<HTMLSpanElement>('save-path');
const saveBtn = $<HTMLButtonElement>('save-btn');

function setStatus(text: string, kind: 'hint' | 'ok' | 'error' = 'hint') {
  statusEl.textContent = text;
  statusEl.className = kind;
}

async function getOpenedMessage(): Promise<OpenedMessageInfo | 'not-gmail' | 'no-script'> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://mail.google.com/')) return 'not-gmail';
  try {
    const req: Request = { type: 'GET_OPENED_MESSAGE' };
    return (await chrome.tabs.sendMessage(tab.id, req)) as OpenedMessageInfo;
  } catch {
    // Вкладку відкрили до встановлення розширення — content script ще не підключився.
    return 'no-script';
  }
}

async function init() {
  $<HTMLAnchorElement>('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const { rootFolderId } = await getSettings();
  // Справжній шлях («Вхідна документація / 2026-2027») з’явиться після читання _config.json.
  pathEl.textContent = rootFolderId ? 'Вхідна документація / …' : 'папку не налаштовано';

  const result = await getOpenedMessage();
  if (result === 'not-gmail' || (result !== 'no-script' && !result.selectedId)) {
    setStatus('Відкрийте лист у Gmail');
    return;
  }
  if (result === 'no-script') {
    setStatus('Оновіть вкладку Gmail (F5), щоб розширення її побачило');
    return;
  }

  const count = result.messages.length;
  setStatus(
    `Знайдено лист${count > 1 ? ` (у ланцюжку ${count})` : ''}. Збереження з’явиться на наступному етапі.`,
    'ok',
  );
  saveBtn.disabled = true; // увімкнемо, коли буде реалізовано збереження
}

init().catch((err) => setStatus(`Помилка: ${String(err)}`, 'error'));
