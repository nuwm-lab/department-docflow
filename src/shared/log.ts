// Локальний журнал останніх 50 операцій (п. 5.6 ТЗ) — для діагностики на сторінці налаштувань.
// Зберігається лише на цьому комп’ютері (chrome.storage.local).

export interface LogEntry {
  /** ISO 8601. */
  at: string;
  email: string;
  action: 'save';
  status: 'saved' | 'duplicate' | 'partial' | 'error';
  /** Назва папки або тема листа. */
  subject: string;
  detail?: string;
  link?: string;
}

const KEY = 'operationLog';
const LIMIT = 50;

export async function readLog(): Promise<LogEntry[]> {
  const stored = (await chrome.storage.local.get(KEY))[KEY];
  return Array.isArray(stored) ? (stored as LogEntry[]) : [];
}

export async function addLog(entry: Omit<LogEntry, 'at'>): Promise<void> {
  const log = await readLog();
  log.unshift({ at: new Date().toISOString(), ...entry });
  await chrome.storage.local.set({ [KEY]: log.slice(0, LIMIT) });
}

export async function clearLog(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
