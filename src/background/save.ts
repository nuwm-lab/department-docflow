// Збереження документа на Диск і в реєстр (п. 5.4–5.6 ТЗ).
//
// Порядок: вкладення й .eml з Gmail → MD5 → перевірка дублікатів → папка року →
// папка документа → файли → реєстр. Рядок у реєстр додається лише після успішного
// завантаження всіх файлів. Якщо частина файлів не завантажилась, стан запам’ятовується
// (chrome.storage.session), і повторна спроба використовує ту саму папку й докачує решту.
import SparkMD5 from 'spark-md5';
import type { DuplicateInfo, SaveProgress, SaveRequest, SaveResult } from '../shared/messages';
import { base64UrlToBytes, parseGmailMessage } from '../sources/gmail/parse';
import type { SourceAttachment, SourceDocument } from '../sources/types';
import { previousAcademicYear } from '../storage/academicYear';
import { uniqueName, localIsoDate } from '../storage/naming';
import { buildRow, columnLetter, findDuplicate } from '../storage/registry';
import {
  createFolder,
  findChildren,
  folderLink,
  getFile,
  FOLDER_MIME,
  SPREADSHEET_MIME,
  type DriveFile,
} from './api/drive';
import { getAttachmentData, getMessageFull, getRawMessage } from './api/gmail';
import { ApiError } from './api/http';
import { appendRow, createRegistry, readCellFormula, readRegistry } from './api/sheets';
import { uploadFile } from './api/upload';
import { ensureYearFolder, loadWorkspace, registryName, WorkspaceError, type Workspace } from './workspace';

export const LETTER_FILE = 'Лист.md';
export const EML_FILE = 'Оригінал.eml';
/** Скільки файлів завантажувати одночасно. */
const PARALLEL_UPLOADS = 3;

// ---------- Дублікати ----------

async function findRegistry(email: string, yearFolderId: string, yearName: string): Promise<DriveFile | null> {
  return (await findChildren(email, yearFolderId, registryName(yearName), SPREADSHEET_MIME))[0] ?? null;
}

/** Реєстри, де шукати дублікати: поточного року й (опційно) попереднього. */
async function registriesToCheck(ws: Workspace): Promise<{ year: string; file: DriveFile }[]> {
  const out: { year: string; file: DriveFile }[] = [];
  if (ws.yearFolder) {
    const reg = await findRegistry(ws.email, ws.yearFolder.id, ws.yearName);
    if (reg) out.push({ year: ws.yearName, file: reg });
  }
  const prevName = ws.config.checkPreviousYear ? previousAcademicYear(ws.yearName) : null;
  if (prevName) {
    const prevFolder = (await findChildren(ws.email, ws.root.id, prevName, FOLDER_MIME))[0];
    const reg = prevFolder && (await findRegistry(ws.email, prevFolder.id, prevName));
    if (reg) out.push({ year: prevName, file: reg });
  }
  return out;
}

/** URL з формули =HYPERLINK("url","назва"). */
const urlFromFormula = (formula: string) => formula.match(/HYPERLINK\(\s*"([^"]+)"/i)?.[1] ?? null;

export async function findDuplicateInRegistries(
  ws: Workspace,
  messageId: string,
  md5: string[],
): Promise<DuplicateInfo | null> {
  for (const { year, file } of await registriesToCheck(ws)) {
    const values = await readRegistry(ws.email, file.id);
    const match = findDuplicate(values, messageId, md5);
    if (!match) continue;
    const folderCol = values[0].indexOf('Папка');
    const folderUrl =
      folderCol >= 0
        ? urlFromFormula(await readCellFormula(ws.email, file.id, `${columnLetter(folderCol)}${match.row}`))
        : null;
    return {
      by: match.by,
      year,
      savedAt: match.savedAt,
      savedBy: match.savedBy,
      folderName: match.folderName,
      folderUrl,
      registryUrl: file.webViewLink ?? null,
    };
  }
  return null;
}

/** Ключ дубліката: заголовок Message-ID, а якщо його немає — ID листа в Gmail. */
export const dedupKey = (doc: SourceDocument) => doc.messageId || `gmail:${doc.sourceId}`;

// ---------- Незавершені збереження ----------

interface PendingSave {
  folderId: string;
  folderName: string;
  /** Уже завантажені файли: назва → ID на Диску. */
  uploaded: Record<string, string>;
}

const pendingKey = (email: string, messageId: string) => `pending:${email}:${messageId}`;

async function readPending(email: string, messageId: string): Promise<PendingSave | null> {
  const key = pendingKey(email, messageId);
  return ((await chrome.storage.session.get(key))[key] as PendingSave | undefined) ?? null;
}

const writePending = (email: string, messageId: string, p: PendingSave) =>
  chrome.storage.session.set({ [pendingKey(email, messageId)]: p });

const clearPending = (email: string, messageId: string) => chrome.storage.session.remove(pendingKey(email, messageId));

// ---------- Допоміжне ----------

function progress(req: SaveRequest, text: string, done = 0, total = 0) {
  const msg: SaveProgress = { type: 'SAVE_PROGRESS', messageId: req.messageId, text, done, total };
  chrome.runtime.sendMessage(msg).catch(() => undefined); // popup міг закритися — не страшно
}

/** «Додаток.pdf» → «Додаток_2.pdf», якщо назва вже зайнята в папці. */
function uniqueFileName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let n = 2; ; n++) {
    const candidate = `${stem}_${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Виконує завдання не більше ніж limit одночасно; помилки не зупиняють решту. */
async function runLimited<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

async function attachmentBytes(email: string, doc: SourceDocument, a: SourceAttachment): Promise<Uint8Array> {
  const data = a.data ?? (a.downloadId ? await getAttachmentData(email, doc.sourceId, a.downloadId) : '');
  return base64UrlToBytes(data);
}

const md5Of = (bytes: Uint8Array) => SparkMD5.ArrayBuffer.hash(bytes.slice().buffer as ArrayBuffer);

/** Папка документа: з незавершеного збереження (якщо ще існує) або нова з унікальною назвою. */
async function documentFolder(
  ws: Workspace,
  yearFolder: DriveFile,
  req: SaveRequest,
  pending: PendingSave | null,
): Promise<{ folder: DriveFile; pending: PendingSave }> {
  if (pending) {
    try {
      const folder = await getFile(ws.email, pending.folderId);
      if (!folder.trashed) return { folder, pending };
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    }
  }
  const taken: string[] = [];
  let name = req.folderName;
  // Інший документ того ж дня з тією ж назвою → «_2», «_3» (п. 5.4 ТЗ).
  while ((await findChildren(ws.email, yearFolder.id, name, FOLDER_MIME)).length) {
    taken.push(name);
    name = uniqueName(req.folderName, taken);
  }
  const folder = await createFolder(ws.email, yearFolder.id, name);
  return { folder, pending: { folderId: folder.id, folderName: folder.name, uploaded: {} } };
}

// ---------- Збереження ----------

export async function saveDocument(req: SaveRequest): Promise<SaveResult> {
  const { email } = req;
  progress(req, 'Перевіряю папку на Диску…');
  const ws = await loadWorkspace(email);
  if (!ws.root.capabilities?.canAddChildren) {
    throw new WorkspaceError(
      `Акаунт ${email} має лише перегляд папки «${ws.root.name}» — зберігати документи не вийде. ` +
        'Попросіть завкафедри надати права редагування.',
    );
  }

  // 1. Лист і вкладення з Gmail.
  progress(req, 'Завантажую лист і вкладення з Gmail…');
  const doc = parseGmailMessage(await getMessageFull(email, req.messageId));
  const selected = doc.attachments.filter((a) => req.attachmentIds.includes(a.id));
  if (selected.length !== req.attachmentIds.length) {
    // Ніколи не зберігаємо мовчки без частини вкладень.
    throw new WorkspaceError('Не вдалося знайти в листі всі вибрані вкладення. Відкрийте розширення ще раз і повторіть.');
  }
  const [raw, ...attachmentData] = await Promise.all([
    getRawMessage(email, doc.sourceId),
    ...selected.map((a) => attachmentBytes(email, doc, a)),
  ]);
  const md5 = attachmentData.map(md5Of);

  // 2. Дублікати (Message-ID і MD5 вкладень), якщо користувач ще не підтвердив повторне збереження.
  const key = dedupKey(doc);
  if (!req.confirmDuplicate) {
    progress(req, 'Перевіряю реєстр на дублікати…');
    const duplicate = await findDuplicateInRegistries(ws, key, md5);
    if (duplicate) return { status: 'duplicate', duplicate };
  }

  // 3. Папки.
  progress(req, 'Створюю папку документа…');
  const yearFolder = await ensureYearFolder(ws);
  const { folder, pending } = await documentFolder(ws, yearFolder, req, await readPending(email, req.messageId));
  await writePending(email, req.messageId, pending);

  // 4. Файли (уже завантажені при попередній спробі пропускаються).
  const taken = new Set([LETTER_FILE, EML_FILE]);
  const files: { name: string; mimeType: string; bytes: Uint8Array }[] = [
    { name: LETTER_FILE, mimeType: 'text/markdown', bytes: new TextEncoder().encode(req.letterMarkdown) },
    { name: EML_FILE, mimeType: 'message/rfc822', bytes: base64UrlToBytes(raw) },
    ...selected.map((a, i) => {
      const name = uniqueFileName(a.filename, taken);
      taken.add(name);
      return { name, mimeType: a.mimeType, bytes: attachmentData[i] };
    }),
  ];
  const todo = files.filter((f) => !pending.uploaded[f.name]);
  let done = files.length - todo.length;
  progress(req, 'Завантажую файли на Диск…', done, files.length);

  const results = await runLimited(
    todo.map((f) => async () => {
      const uploaded = await uploadFile(email, { parentId: folder.id, name: f.name, mimeType: f.mimeType, bytes: f.bytes });
      pending.uploaded[f.name] = uploaded.id;
      await writePending(email, req.messageId, pending);
      progress(req, 'Завантажую файли на Диск…', ++done, files.length);
      return uploaded;
    }),
    PARALLEL_UPLOADS,
  );

  const failed = results.flatMap((r, i) =>
    r.status === 'rejected'
      ? [{ name: todo[i].name, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }]
      : [],
  );
  if (failed.length) {
    return { status: 'partial', failed, folderUrl: folderLink(folder.id), folderName: folder.name };
  }

  // 5. Реєстр — лише після успішного завантаження всіх файлів.
  progress(req, 'Додаю запис у реєстр…', files.length, files.length);
  const registry =
    (await findRegistry(email, yearFolder.id, ws.yearName)) ??
    (await createRegistry(email, yearFolder.id, registryName(ws.yearName)));
  await appendRow(
    email,
    registry.id,
    buildRow({
      receivedDate: localIsoDate(new Date(doc.receivedAt)),
      type: req.fields.type,
      number: req.fields.number,
      documentDate: req.fields.documentDate,
      from: req.fields.from,
      summary: req.fields.summary,
      note: req.fields.note,
      attachmentCount: selected.length,
      folderUrl: folderLink(folder.id),
      folderName: folder.name,
      savedBy: email,
      savedAt: new Date(),
      messageId: key,
      md5,
    }),
  );
  await clearPending(email, req.messageId);

  return {
    status: 'saved',
    folderUrl: folderLink(folder.id),
    folderName: folder.name,
    registryUrl: registry.webViewLink ?? `https://docs.google.com/spreadsheets/d/${registry.id}/edit`,
  };
}
