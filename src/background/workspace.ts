// «Робоче місце» на Диску: коренева папка → _config.json → папка навчального року → реєстр.
import type { AccessCheckItem, AccessReport, SaveLocation } from '../shared/messages';
import { getSettings } from '../shared/storage';
import { academicYearFor } from '../storage/academicYear';
import { CONFIG_FILE_NAME, ConfigError, DEFAULT_CONFIG, parseConfig, type DocflowConfig } from '../storage/config';
import {
  createFolder,
  downloadText,
  findChildren,
  folderLink,
  getFile,
  FOLDER_MIME,
  SPREADSHEET_MIME,
  type DriveFile,
} from './api/drive';
import { ApiError } from './api/http';

export const registryName = (yearName: string) => `Реєстр вхідних документів ${yearName}`;

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

export interface Workspace {
  email: string;
  root: DriveFile;
  config: DocflowConfig;
  /** Звідки взято налаштування: файл на Диску чи значення за замовчуванням. */
  configSource: 'file' | 'default';
  configWarnings: string[];
  yearName: string;
  /** Папку року задано в _config.json (тоді її не створюємо автоматично). */
  yearFromConfig: boolean;
  /** null — папки року ще немає. */
  yearFolder: DriveFile | null;
}

/** Коренева папка з налаштувань; зрозумілі помилки, якщо її немає чи немає доступу. */
async function loadRoot(email: string): Promise<DriveFile> {
  const { rootFolderId } = await getSettings();
  if (!rootFolderId) {
    throw new WorkspaceError('Папку «Вхідна документація» не налаштовано. Відкрийте налаштування розширення.');
  }
  let root: DriveFile;
  try {
    root = await getFile(email, rootFolderId);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
      throw new WorkspaceError(
        `Папку «Вхідна документація» не знайдено або акаунт ${email} не має до неї доступу.`,
      );
    }
    throw err;
  }
  if (root.mimeType !== FOLDER_MIME) {
    throw new WorkspaceError('Посилання в налаштуваннях веде не на папку, а на файл.');
  }
  if (root.trashed) throw new WorkspaceError('Папка «Вхідна документація» у кошику.');
  return root;
}

async function loadConfig(
  email: string,
  root: DriveFile,
): Promise<Pick<Workspace, 'config' | 'configSource' | 'configWarnings'>> {
  const files = (await findChildren(email, root.id, CONFIG_FILE_NAME)).filter((f) => f.mimeType !== FOLDER_MIME);
  if (files.length === 0) {
    return {
      config: structuredClone(DEFAULT_CONFIG),
      configSource: 'default',
      configWarnings: [`Файл ${CONFIG_FILE_NAME} не знайдено — використано налаштування за замовчуванням.`],
    };
  }
  const text = await downloadText(email, files[0]);
  try {
    const { config, warnings } = parseConfig(text);
    if (files.length > 1) {
      warnings.unshift(`У папці кілька файлів ${CONFIG_FILE_NAME} — використано найновіший.`);
    }
    return { config, configSource: 'file', configWarnings: warnings };
  } catch (err) {
    if (err instanceof ConfigError) throw new WorkspaceError(err.message);
    throw err;
  }
}

async function findYearFolder(email: string, root: DriveFile, yearName: string): Promise<DriveFile | null> {
  return (await findChildren(email, root.id, yearName, FOLDER_MIME))[0] ?? null;
}

export async function loadWorkspace(email: string): Promise<Workspace> {
  const root = await loadRoot(email);
  const cfg = await loadConfig(email, root);
  const yearFromConfig = cfg.config.currentYearFolder !== null;
  const yearName = cfg.config.currentYearFolder ?? academicYearFor(new Date());
  const yearFolder = await findYearFolder(email, root, yearName);
  return { email, root, ...cfg, yearName, yearFromConfig, yearFolder };
}

/**
 * Папка року для збереження. Якщо її немає і рік визначено за датою — створює.
 * Якщо її явно вказано в _config.json, але не знайдено — помилка (адміністратор помилився в назві).
 */
export async function ensureYearFolder(ws: Workspace): Promise<DriveFile> {
  if (ws.yearFolder) return ws.yearFolder;
  if (ws.yearFromConfig) {
    throw new WorkspaceError(
      `Папку «${ws.yearName}», вказану в ${CONFIG_FILE_NAME} (currentYearFolder), не знайдено у «${ws.root.name}».`,
    );
  }
  ws.yearFolder = await createFolder(ws.email, ws.root.id, ws.yearName);
  return ws.yearFolder;
}

/** Шлях для показу в popup, без змін на Диску. */
export function saveLocationOf(ws: Workspace): SaveLocation {
  if (!ws.yearFolder && ws.yearFromConfig) {
    throw new WorkspaceError(
      `Папку «${ws.yearName}», вказану в ${CONFIG_FILE_NAME} (currentYearFolder), не знайдено у «${ws.root.name}».`,
    );
  }
  return {
    path: `${ws.root.name} / ${ws.yearName}`,
    rootLink: folderLink(ws.root.id),
    yearExists: ws.yearFolder !== null,
  };
}

export async function getSaveLocation(email: string): Promise<SaveLocation> {
  return saveLocationOf(await loadWorkspace(email));
}

/** «Перевірити доступ» на сторінці налаштувань: покроковий звіт. */
export async function checkAccess(email: string): Promise<AccessReport> {
  const items: AccessCheckItem[] = [{ label: 'Акаунт Google', status: 'ok', detail: email }];
  const report = (): AccessReport => ({ items, ok: items.every((i) => i.status !== 'error') });
  const fail = (label: string, err: unknown) => {
    items.push({ label, status: 'error', detail: err instanceof Error ? err.message : String(err) });
    return report();
  };

  let root: DriveFile;
  try {
    root = await loadRoot(email);
    items.push({ label: 'Папка', status: 'ok', detail: root.name, link: folderLink(root.id) });
  } catch (err) {
    return fail('Папка', err);
  }

  if (root.capabilities?.canAddChildren) {
    items.push({ label: 'Право запису', status: 'ok', detail: 'Є' });
  } else {
    items.push({
      label: 'Право запису',
      status: 'error',
      detail: 'Лише перегляд — зберігати документи не вийде. Попросіть завкафедри надати права редагування.',
    });
  }

  let cfg: Awaited<ReturnType<typeof loadConfig>>;
  try {
    cfg = await loadConfig(email, root);
    if (cfg.configSource === 'file') {
      items.push({ label: 'Налаштування', status: 'ok', detail: `${CONFIG_FILE_NAME} прочитано` });
    }
    // Для налаштувань за замовчуванням єдине зауваження вже пояснює ситуацію.
    for (const w of cfg.configWarnings) items.push({ label: 'Налаштування', status: 'warn', detail: w });
  } catch (err) {
    return fail('Налаштування', err);
  }

  const yearFromConfig = cfg.config.currentYearFolder !== null;
  const yearName = cfg.config.currentYearFolder ?? academicYearFor(new Date());
  const source = yearFromConfig ? `з ${CONFIG_FILE_NAME}` : 'за поточною датою';
  const yearFolder = await findYearFolder(email, root, yearName);
  if (yearFolder) {
    items.push({ label: 'Папка року', status: 'ok', detail: `${yearName} (${source})`, link: folderLink(yearFolder.id) });
  } else if (yearFromConfig) {
    items.push({
      label: 'Папка року',
      status: 'error',
      detail: `Папку «${yearName}», вказану в ${CONFIG_FILE_NAME}, не знайдено.`,
    });
    return report();
  } else {
    items.push({
      label: 'Папка року',
      status: 'warn',
      detail: `«${yearName}» (${source}) ще немає — буде створена під час першого збереження.`,
    });
  }

  const registry = yearFolder
    ? (await findChildren(email, yearFolder.id, registryName(yearName), SPREADSHEET_MIME))[0]
    : undefined;
  items.push(
    registry
      ? { label: 'Реєстр', status: 'ok', detail: registry.name, link: registry.webViewLink }
      : { label: 'Реєстр', status: 'warn', detail: 'Ще немає — буде створений під час першого збереження.' },
  );

  return report();
}
