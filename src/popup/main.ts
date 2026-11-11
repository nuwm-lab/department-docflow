// Popup: визначає відкритий лист і пошту у вкладці Gmail, входить у Google
// під цією поштою і показує тему листа з Gmail API (перевірка зв’язку).
// Збереження з’явиться на наступних кроках.
import {
  callBackground,
  type AuthStatus,
  type ContentRequest,
  type MessagePreview,
  type OpenedMessageInfo,
} from '../shared/messages';
import { getSettings } from '../shared/storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusEl = $<HTMLParagraphElement>('status');
const pathEl = $<HTMLSpanElement>('save-path');
const accountEl = $<HTMLParagraphElement>('account');
const accountEmailEl = $<HTMLSpanElement>('account-email');
const signInBtn = $<HTMLButtonElement>('sign-in-btn');
const signOutLink = $<HTMLAnchorElement>('sign-out');
const previewEl = $<HTMLDListElement>('preview');
const saveBtn = $<HTMLButtonElement>('save-btn');

function setStatus(text: string, kind: 'hint' | 'ok' | 'error' = 'hint') {
  statusEl.textContent = text;
  statusEl.className = kind;
}

async function getOpenedMessage(): Promise<OpenedMessageInfo | 'not-gmail' | 'no-script'> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://mail.google.com/')) return 'not-gmail';
  try {
    const req: ContentRequest = { type: 'GET_OPENED_MESSAGE' };
    return (await chrome.tabs.sendMessage(tab.id, req)) as OpenedMessageInfo;
  } catch {
    // Вкладку відкрили до встановлення розширення — content script ще не підключився.
    return 'no-script';
  }
}

async function showPreview(email: string, messageId: string) {
  setStatus('Завантажую лист з Gmail…');
  const res = await callBackground<MessagePreview>({ type: 'GET_MESSAGE_PREVIEW', email, messageId });
  if (!res.ok) {
    setStatus(res.error, 'error');
    return;
  }
  $('pv-subject').textContent = res.data.subject || '(без теми)';
  $('pv-from').textContent = res.data.from;
  $('pv-date').textContent = res.data.date;
  previewEl.hidden = false;
  setStatus('Зв’язок з Gmail працює. Збереження з’явиться на наступному етапі.', 'ok');
}

async function connect(email: string, messageId: string) {
  accountEmailEl.textContent = email;
  accountEl.hidden = false;
  setStatus('Перевіряю вхід у Google…');

  const status = await callBackground<AuthStatus>({ type: 'AUTH_STATUS', email });
  if (!status.ok) {
    setStatus(status.error, 'error');
    return;
  }

  if (!status.data.signedIn) {
    setStatus(`Щоб працювати з листами, увійдіть у Google як ${email}.`);
    signInBtn.textContent = `Увійти як ${email}`;
    signInBtn.hidden = false;
    signInBtn.onclick = async () => {
      signInBtn.disabled = true;
      setStatus('Відкриваю вікно входу Google… Після входу відкрийте розширення ще раз.');
      const res = await callBackground<AuthStatus>({ type: 'SIGN_IN', email });
      signInBtn.disabled = false;
      if (!res.ok) {
        setStatus(res.error, 'error');
        return;
      }
      signInBtn.hidden = true;
      await connect(email, messageId);
    };
    return;
  }

  signOutLink.hidden = false;
  signOutLink.onclick = async (e) => {
    e.preventDefault();
    await callBackground<AuthStatus>({ type: 'SIGN_OUT', email });
    window.close();
  };
  await showPreview(email, messageId);
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
  if (result === 'no-script') {
    setStatus('Оновіть вкладку Gmail (F5), щоб розширення її побачило');
    return;
  }
  if (result === 'not-gmail' || !result.selectedId) {
    setStatus('Відкрийте лист у Gmail');
    return;
  }
  saveBtn.disabled = true; // увімкнемо, коли буде реалізовано збереження

  if (result.accountEmail) {
    await connect(result.accountEmail, result.selectedId);
  } else {
    await connectByIndex(result.accountIndex, result.selectedId);
  }
}

/**
 * Пошту на сторінці Gmail не видно — визначаємо її через Google за номером
 * акаунта з URL (/mail/u/N/). Перший раз потрібен вхід.
 */
async function connectByIndex(accountIndex: number, messageId: string) {
  setStatus('Перевіряю вхід у Google…');
  const res = await callBackground<AuthStatus>({ type: 'RESOLVE_ACCOUNT', accountIndex, interactive: false });
  if (!res.ok) {
    setStatus(res.error, 'error');
    return;
  }
  if (res.data.signedIn) {
    await connect(res.data.email, messageId);
    return;
  }

  setStatus('Щоб працювати з листами, увійдіть у Google під поштою, відкритою у цій вкладці.');
  signInBtn.textContent = 'Увійти в Google';
  signInBtn.hidden = false;
  signInBtn.onclick = async () => {
    signInBtn.disabled = true;
    setStatus('Відкриваю вікно входу Google… Після входу відкрийте розширення ще раз.');
    const signed = await callBackground<AuthStatus>({ type: 'RESOLVE_ACCOUNT', accountIndex, interactive: true });
    signInBtn.disabled = false;
    if (!signed.ok) {
      setStatus(signed.error, 'error');
      return;
    }
    signInBtn.hidden = true;
    await connect(signed.data.email, messageId);
  };
}

init().catch((err) => setStatus(`Помилка: ${String(err)}`, 'error'));
