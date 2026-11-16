// Локальні налаштування користувача в chrome.storage.sync
// (переносяться на інші комп’ютери з тим самим Google-акаунтом Chrome).

// type, а не interface: chrome.storage.get приймає об’єкт з індексною сигнатурою.
export type UserSettings = {
  /** ID кореневої папки «Вхідна документація» на Google Диску. */
  rootFolderId: string | null;
};

const DEFAULTS: UserSettings = { rootFolderId: null };

export async function getSettings(): Promise<UserSettings> {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored } as UserSettings;
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

/**
 * Пошта, під якою востаннє успішно входили (для сторінки налаштувань, де немає вкладки Gmail).
 * Локально на цьому комп’ютері (chrome.storage.local).
 */
export async function getLastEmail(): Promise<string | null> {
  const { lastEmail } = await chrome.storage.local.get('lastEmail');
  return typeof lastEmail === 'string' ? lastEmail : null;
}

export async function setLastEmail(email: string): Promise<void> {
  await chrome.storage.local.set({ lastEmail: email.toLowerCase() });
}

/**
 * Витягує ID папки з посилання Google Диска або повертає сам ID.
 * Підтримує: https://drive.google.com/drive/folders/<ID>, …/drive/u/0/folders/<ID>,
 * …?id=<ID>, а також «голий» ID.
 */
export function parseFolderId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const fromPath = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (fromPath) return fromPath[1];
  const fromQuery = s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (fromQuery) return fromQuery[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}
