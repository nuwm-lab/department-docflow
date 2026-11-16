// Сторінка налаштувань: коренева папка «Вхідна документація» і «Перевірити доступ».
import { callBackground, type AccessReport, type AuthStatus } from '../shared/messages';
import { clearLog, readLog, type LogEntry } from '../shared/log';
import { getLastEmail, getSettings, parseFolderId, saveSettings } from '../shared/storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const input = $<HTMLInputElement>('root-folder');
const saveBtn = $<HTMLButtonElement>('save-btn');
const statusEl = $<HTMLSpanElement>('status');
const accountEl = $<HTMLSpanElement>('account');
const accountHint = $<HTMLParagraphElement>('account-hint');
const checkBtn = $<HTMLButtonElement>('check-btn');
const signInBtn = $<HTMLButtonElement>('sign-in-btn');
const reportEl = $<HTMLUListElement>('report');

const ICONS = { ok: '✓', warn: '!', error: '✗' } as const;

let email: string | null = null;
let hasFolder = false;

function setStatus(text: string, kind: 'ok' | 'error' | '' = '') {
  statusEl.textContent = text;
  statusEl.className = kind;
}

function updateCheckButton() {
  checkBtn.disabled = !email || !hasFolder;
}

function renderReport(report: AccessReport) {
  reportEl.replaceChildren();
  for (const item of report.items) {
    const li = document.createElement('li');
    li.className = item.status;
    const icon = Object.assign(document.createElement('span'), { className: 'icon', textContent: ICONS[item.status] });
    const label = Object.assign(document.createElement('span'), { className: 'label', textContent: item.label });
    const detail = Object.assign(document.createElement('span'), { className: 'detail', textContent: item.detail });
    if (item.link) {
      detail.append(Object.assign(document.createElement('a'), { href: item.link, target: '_blank', textContent: 'відкрити' }));
    }
    li.append(icon, label, detail);
    reportEl.append(li);
  }
  const summary = document.createElement('li');
  summary.className = report.ok ? 'ok' : 'error';
  summary.append(
    Object.assign(document.createElement('span'), { className: 'icon', textContent: ICONS[report.ok ? 'ok' : 'error'] }),
    Object.assign(document.createElement('span'), {
      className: 'summary',
      textContent: report.ok ? 'Можна зберігати документи' : 'Зберігати документи поки не вийде — див. вище',
    }),
  );
  summary.style.gridTemplateColumns = '22px 1fr';
  reportEl.append(summary);
  reportEl.hidden = false;
}

function renderError(text: string) {
  reportEl.replaceChildren();
  const li = document.createElement('li');
  li.className = 'error';
  li.style.gridTemplateColumns = '22px 1fr';
  li.append(
    Object.assign(document.createElement('span'), { className: 'icon', textContent: ICONS.error }),
    Object.assign(document.createElement('span'), { className: 'detail', textContent: text }),
  );
  reportEl.append(li);
  reportEl.hidden = false;
}

async function runCheck() {
  if (!email) return;
  checkBtn.disabled = true;
  checkBtn.textContent = 'Перевіряю…';
  signInBtn.hidden = true;
  try {
    const res = await callBackground<AccessReport>({ type: 'CHECK_ACCESS', email });
    if (res.ok) {
      renderReport(res.data);
    } else if (res.code === 'NEED_SIGN_IN') {
      renderError(`Потрібно увійти в Google як ${email}.`);
      signInBtn.textContent = `Увійти як ${email}`;
      signInBtn.hidden = false;
    } else {
      renderError(res.error);
    }
  } finally {
    checkBtn.textContent = 'Перевірити доступ';
    updateCheckButton();
  }
}

const LOG_LABELS: Record<LogEntry['status'], { icon: string; kind: 'ok' | 'warn' | 'error'; text: string }> = {
  saved: { icon: ICONS.ok, kind: 'ok', text: 'Збережено' },
  duplicate: { icon: ICONS.warn, kind: 'warn', text: 'Дублікат' },
  partial: { icon: ICONS.error, kind: 'error', text: 'Частково' },
  error: { icon: ICONS.error, kind: 'error', text: 'Помилка' },
};

async function renderLog() {
  const log = await readLog();
  const list = $<HTMLUListElement>('log');
  list.replaceChildren(
    ...log.map((e) => {
      const l = LOG_LABELS[e.status];
      const li = Object.assign(document.createElement('li'), { className: l.kind });
      const when = new Date(e.at).toLocaleString('uk-UA', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      const detail = Object.assign(document.createElement('span'), {
        className: 'detail',
        textContent: [e.subject, e.detail, e.email].filter(Boolean).join(' — '),
      });
      if (e.link) {
        detail.append(Object.assign(document.createElement('a'), { href: e.link, target: '_blank', textContent: 'папка' }));
      }
      li.append(
        Object.assign(document.createElement('span'), { className: 'icon', textContent: l.icon }),
        Object.assign(document.createElement('span'), { className: 'label', textContent: `${when} · ${l.text}` }),
        detail,
      );
      return li;
    }),
  );
  list.hidden = log.length === 0;
  $<HTMLParagraphElement>('log-empty').hidden = log.length > 0;
  $<HTMLButtonElement>('log-clear').hidden = log.length === 0;
}

async function init() {
  await renderLog();
  $<HTMLButtonElement>('log-clear').addEventListener('click', async () => {
    await clearLog();
    await renderLog();
  });

  const { rootFolderId } = await getSettings();
  hasFolder = !!rootFolderId;
  if (rootFolderId) input.value = `https://drive.google.com/drive/folders/${rootFolderId}`;

  email = await getLastEmail();
  accountEl.textContent = email ?? 'ще не входили';
  accountHint.hidden = !!email;
  updateCheckButton();

  saveBtn.addEventListener('click', async () => {
    const id = parseFolderId(input.value);
    if (!id) {
      setStatus('Не схоже на посилання на папку Google Диска', 'error');
      return;
    }
    await saveSettings({ rootFolderId: id });
    input.value = `https://drive.google.com/drive/folders/${id}`;
    hasFolder = true;
    setStatus('Збережено', 'ok');
    updateCheckButton();
    if (email) await runCheck();
  });

  checkBtn.addEventListener('click', runCheck);

  // Увійшли через popup, поки ця сторінка відкрита — оновлюємо акаунт без перезавантаження.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.operationLog) void renderLog();
    if (area !== 'local' || !changes.lastEmail) return;
    email = (changes.lastEmail.newValue as string | undefined) ?? null;
    accountEl.textContent = email ?? 'ще не входили';
    accountHint.hidden = !!email;
    updateCheckButton();
  });

  signInBtn.addEventListener('click', async () => {
    if (!email) return;
    signInBtn.disabled = true;
    const res = await callBackground<AuthStatus>({ type: 'SIGN_IN', email });
    signInBtn.disabled = false;
    if (!res.ok) {
      renderError(res.error);
      return;
    }
    await runCheck();
  });
}

init().catch((err) => setStatus(`Помилка: ${String(err)}`, 'error'));
