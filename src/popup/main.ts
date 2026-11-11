// Popup: визначає відкритий лист і пошту у вкладці Gmail, входить у Google,
// читає лист повністю й показує форму збереження з автоматично заповненими реквізитами.
import { makeDraft } from '../classify/draft';
import {
  callBackground,
  type AuthStatus,
  type ContentRequest,
  type DuplicateInfo,
  type OpenedMessageInfo,
  type PreparedDocument,
  type SaveProgress,
  type SaveRequest,
  type SaveResult,
} from '../shared/messages';
import { getSettings } from '../shared/storage';
import { buildLetterMarkdown } from '../storage/markdown';
import { buildFolderName, localIsoDate } from '../storage/naming';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusEl = $<HTMLParagraphElement>('status');
const pathEl = $<HTMLSpanElement>('save-path');
const accountEl = $<HTMLParagraphElement>('account');
const accountEmailEl = $<HTMLSpanElement>('account-email');
const signInBtn = $<HTMLButtonElement>('sign-in-btn');
const signOutLink = $<HTMLAnchorElement>('sign-out');
const form = $<HTMLFormElement>('form');

const f = {
  threadRow: $<HTMLLabelElement>('thread-row'),
  thread: $<HTMLSelectElement>('f-thread'),
  type: $<HTMLSelectElement>('f-type'),
  number: $<HTMLInputElement>('f-number'),
  date: $<HTMLInputElement>('f-date'),
  from: $<HTMLInputElement>('f-from'),
  summary: $<HTMLTextAreaElement>('f-summary'),
  note: $<HTMLInputElement>('f-note'),
  folderName: $<HTMLElement>('folder-name'),
  attList: $<HTMLUListElement>('att-list'),
  attEmpty: $<HTMLParagraphElement>('att-empty'),
  mdPreview: $<HTMLDetailsElement>('md-preview'),
  mdText: $<HTMLPreElement>('md-text'),
};

const saveBtn = $<HTMLButtonElement>('save-btn');
const dup = {
  box: $<HTMLDivElement>('dup-box'),
  text: $<HTMLParagraphElement>('dup-text'),
  folder: $<HTMLAnchorElement>('dup-folder'),
  registry: $<HTMLAnchorElement>('dup-registry'),
  confirm: $<HTMLInputElement>('dup-confirm'),
};
const result = {
  box: $<HTMLDivElement>('result'),
  text: $<HTMLParagraphElement>('result-text'),
  failed: $<HTMLUListElement>('result-failed'),
  folder: $<HTMLAnchorElement>('result-folder'),
  registry: $<HTMLAnchorElement>('result-registry'),
  retry: $<HTMLButtonElement>('retry-btn'),
};
const progressBox = $<HTMLDivElement>('progress');
const progressBar = $<HTMLProgressElement>('progress-bar');
const progressText = $<HTMLParagraphElement>('progress-text');

/** Поточний підготовлений документ і пошта, під якою працюємо. */
let prepared: PreparedDocument | null = null;
let currentEmail: string | null = null;
let saving = false;

function setStatus(text: string, kind: 'hint' | 'ok' | 'error' = 'hint') {
  statusEl.textContent = text;
  statusEl.className = kind;
  statusEl.hidden = !text;
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`;

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// ---------- Вкладка Gmail ----------

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

// ---------- Вхід у Google ----------

function offerSignIn(text: string, buttonText: string, signIn: () => Promise<void>) {
  setStatus(text);
  signInBtn.textContent = buttonText;
  signInBtn.hidden = false;
  signInBtn.onclick = async () => {
    signInBtn.disabled = true;
    setStatus('Відкриваю вікно входу Google… Після входу відкрийте розширення ще раз.');
    try {
      await signIn();
    } finally {
      signInBtn.disabled = false;
    }
  };
}

async function connect(email: string, messageId: string) {
  accountEmailEl.textContent = email;
  accountEl.hidden = false;
  setStatus('Перевіряю вхід у Google…');

  const status = await callBackground<AuthStatus>({ type: 'AUTH_STATUS', email });
  if (!status.ok) return setStatus(status.error, 'error');

  if (!status.data.signedIn) {
    return offerSignIn(`Щоб працювати з листами, увійдіть у Google як ${email}.`, `Увійти як ${email}`, async () => {
      const res = await callBackground<AuthStatus>({ type: 'SIGN_IN', email });
      if (!res.ok) return setStatus(res.error, 'error');
      signInBtn.hidden = true;
      await connect(email, messageId);
    });
  }

  signOutLink.hidden = false;
  signOutLink.onclick = async (e) => {
    e.preventDefault();
    await callBackground<AuthStatus>({ type: 'SIGN_OUT', email });
    window.close();
  };
  await loadDocument(email, messageId);
}

/** Пошту на сторінці не видно — визначаємо через Google за номером акаунта з URL (/mail/u/N/). */
async function connectByIndex(accountIndex: number, messageId: string) {
  setStatus('Перевіряю вхід у Google…');
  const res = await callBackground<AuthStatus>({ type: 'RESOLVE_ACCOUNT', accountIndex, interactive: false });
  if (!res.ok) return setStatus(res.error, 'error');
  if (res.data.signedIn) return connect(res.data.email, messageId);

  offerSignIn('Щоб працювати з листами, увійдіть у Google під поштою, відкритою у цій вкладці.', 'Увійти в Google', async () => {
    const signed = await callBackground<AuthStatus>({ type: 'RESOLVE_ACCOUNT', accountIndex, interactive: true });
    if (!signed.ok) return setStatus(signed.error, 'error');
    signInBtn.hidden = true;
    await connect(signed.data.email, messageId);
  });
}

// ---------- Форма збереження ----------

async function loadDocument(email: string, messageId: string) {
  setStatus('Читаю лист…');
  form.hidden = true;
  dup.box.hidden = true;
  result.box.hidden = true;
  const res = await callBackground<PreparedDocument>({ type: 'PREPARE_DOCUMENT', email, messageId });
  if (!res.ok) return setStatus(res.error, 'error');
  prepared = res.data;
  currentEmail = email;
  renderForm(email, res.data);
  setStatus('');
}

function renderForm(email: string, p: PreparedDocument) {
  const { doc, config, location, thread } = p;
  pathEl.textContent = location.path + (location.yearExists ? '' : ' (буде створено)');

  // Ланцюжок: вибір листа, якщо їх кілька.
  f.threadRow.hidden = thread.length < 2;
  f.thread.replaceChildren(
    ...thread.map((m) => {
      const from = m.from.replace(/\s*<[^>]+>/, '') || m.from;
      return new Option(`${formatDateTime(m.date)} — ${from}`, m.id, false, m.id === doc.sourceId);
    }),
  );
  f.thread.onchange = () => loadDocument(email, f.thread.value);

  const draft = makeDraft(doc, config);
  const types = config.documentTypes.includes(draft.type) ? config.documentTypes : [...config.documentTypes, draft.type];
  f.type.replaceChildren(...types.map((t) => new Option(t, t, false, t === draft.type)));
  f.number.value = draft.number;
  f.date.value = draft.documentDate;
  f.from.value = draft.from;
  f.summary.value = draft.summary;
  f.note.value = draft.note;

  // Вкладення: звичайні обрано, вбудовані зображення (логотипи підписів) — ні.
  f.attList.replaceChildren(
    ...doc.attachments.map((a, i) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const cb = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !a.inline });
      cb.dataset.index = String(i);
      const name = Object.assign(document.createElement('span'), { className: 'name', textContent: a.filename });
      const size = Object.assign(document.createElement('span'), {
        className: 'size',
        textContent: formatSize(a.size) + (a.inline ? ', вбудоване' : ''),
      });
      label.append(cb, name, size);
      li.append(label);
      return li;
    }),
  );
  f.attEmpty.hidden = doc.attachments.length > 0;

  updateFolderName();
  if (f.mdPreview.open) updateMarkdownPreview();
  if (p.duplicate) showDuplicate(p.duplicate);
  form.hidden = false;
  updateSaveButton();
}

// ---------- Дублікати, збереження, результат ----------

function showDuplicate(d: DuplicateInfo) {
  const when = [d.savedAt, d.savedBy].filter(Boolean).join(', ');
  const where = prepared && d.year !== prepared.location.path.split(' / ').pop() ? ` (реєстр ${d.year})` : '';
  dup.text.textContent =
    d.by === 'message-id'
      ? `Вже збережено${when ? `: ${when}` : ''}${where}.`
      : `Ці вкладення вже є в реєстрі — «${d.folderName}»${when ? `, ${when}` : ''}${where}. ` +
        'Можливо, той самий документ прийшов іншим листом.';
  dup.folder.hidden = !d.folderUrl;
  if (d.folderUrl) dup.folder.href = d.folderUrl;
  dup.registry.hidden = !d.registryUrl;
  if (d.registryUrl) dup.registry.href = d.registryUrl;
  dup.confirm.checked = false;
  dup.box.hidden = false;
  updateSaveButton();
}

function updateSaveButton() {
  saveBtn.disabled = saving || (!dup.box.hidden && !dup.confirm.checked);
  saveBtn.textContent = !dup.box.hidden ? 'Зберегти ще раз' : 'Зберегти';
}

function setLink(a: HTMLAnchorElement, url: string | null | undefined) {
  a.hidden = !url;
  if (url) a.href = url;
}

function showResult(kind: 'ok' | 'error', text: string) {
  result.box.className = `box ${kind}-box`;
  result.text.textContent = text;
  result.failed.replaceChildren();
  result.retry.hidden = true;
  result.box.hidden = false;
}

function buildRequest(): SaveRequest | null {
  if (!prepared || !currentEmail) return null;
  const doc = prepared.doc;
  const checked = Array.from(f.attList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).filter(
    (cb) => cb.checked,
  );
  return {
    email: currentEmail,
    messageId: doc.sourceId,
    fields: {
      type: f.type.value,
      number: f.number.value.trim(),
      documentDate: f.date.value,
      from: f.from.value.trim(),
      summary: f.summary.value.trim(),
      note: f.note.value.trim(),
    },
    folderName: f.folderName.textContent ?? '',
    attachmentIds: checked.map((cb) => doc.attachments[Number(cb.dataset.index)].id),
    letterMarkdown: buildLetterMarkdown(doc, selectedAttachmentNames(), f.note.value),
    confirmDuplicate: !dup.box.hidden && dup.confirm.checked,
  };
}

async function runSave(request: SaveRequest) {
  saving = true;
  form.inert = true;
  result.box.hidden = true;
  progressBox.hidden = false;
  progressBar.removeAttribute('value');
  progressText.textContent = 'Починаю…';
  setStatus('');
  updateSaveButton();

  const res = await callBackground<SaveResult>({ type: 'SAVE_DOCUMENT', request });

  saving = false;
  form.inert = false;
  progressBox.hidden = true;
  updateSaveButton();

  if (!res.ok) {
    showResult('error', res.error);
    return;
  }
  const r = res.data;
  switch (r.status) {
    case 'saved':
      form.hidden = true;
      dup.box.hidden = true;
      showResult('ok', `✓ Збережено: «${r.folderName}»`);
      setLink(result.folder, r.folderUrl);
      setLink(result.registry, r.registryUrl);
      break;
    case 'duplicate':
      showDuplicate(r.duplicate);
      dup.box.scrollIntoView({ behavior: 'smooth' });
      break;
    case 'partial':
      showResult(
        'error',
        'Не всі файли вдалося завантажити, тому запис у реєстр не додано. ' +
          'Натисніть «Повторити» — папку буде використано ту саму, завантажаться лише відсутні файли.',
      );
      result.failed.replaceChildren(
        ...r.failed.map((x) => Object.assign(document.createElement('li'), { textContent: `${x.name}: ${x.error}` })),
      );
      setLink(result.folder, r.folderUrl);
      setLink(result.registry, null);
      result.retry.hidden = false;
      result.retry.onclick = () => runSave(request);
      break;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const request = buildRequest();
  if (request && !saving) await runSave(request);
});
dup.confirm.addEventListener('change', updateSaveButton);

chrome.runtime.onMessage.addListener((msg: SaveProgress) => {
  if (msg?.type !== 'SAVE_PROGRESS' || !saving || msg.messageId !== prepared?.doc.sourceId) return;
  progressText.textContent = msg.total ? `${msg.text} ${msg.done} з ${msg.total}` : msg.text;
  if (msg.total) {
    progressBar.max = msg.total;
    progressBar.value = msg.done;
  } else {
    progressBar.removeAttribute('value');
  }
});

function selectedAttachmentNames(): string[] {
  if (!prepared) return [];
  const doc = prepared.doc;
  return Array.from(f.attList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    .filter((cb) => cb.checked)
    .map((cb) => doc.attachments[Number(cb.dataset.index)].filename);
}

function updateFolderName() {
  if (!prepared) return;
  f.folderName.textContent = buildFolderName(
    {
      date: localIsoDate(new Date(prepared.doc.receivedAt)),
      type: f.type.value,
      number: f.number.value,
      summary: f.summary.value,
    },
    prepared.config.folderNameTemplate,
  );
}

function updateMarkdownPreview() {
  if (!prepared) return;
  f.mdText.textContent = buildLetterMarkdown(prepared.doc, selectedAttachmentNames(), f.note.value);
}

form.addEventListener('input', () => {
  updateFolderName();
  if (f.mdPreview.open) updateMarkdownPreview();
});
f.mdPreview.addEventListener('toggle', () => {
  if (f.mdPreview.open) updateMarkdownPreview();
});

// ---------- Старт ----------

async function init() {
  $<HTMLAnchorElement>('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const { rootFolderId } = await getSettings();
  pathEl.textContent = rootFolderId ? '…' : 'папку не налаштовано';

  const result = await getOpenedMessage();
  if (result === 'no-script') return setStatus('Оновіть вкладку Gmail (F5), щоб розширення її побачило');
  if (result === 'not-gmail' || !result.selectedId) return setStatus('Відкрийте лист у Gmail');

  if (result.accountEmail) await connect(result.accountEmail, result.selectedId);
  else await connectByIndex(result.accountIndex, result.selectedId);
}

init().catch((err) => setStatus(`Помилка: ${String(err)}`, 'error'));
