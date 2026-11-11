// Service worker розширення: авторизація Google і запити до API.
import type {
  AccessReport,
  AuthStatus,
  BackgroundRequest,
  PreparedDocument,
  Result,
  SaveLocation,
  SaveRequest,
  SaveResult,
} from '../shared/messages';
import { addLog } from '../shared/log';
import { saveDocument } from './save';
import { checkAccess, getSaveLocation } from './workspace';
import { getSettings } from '../shared/storage';
import { prepareDocument } from './prepare';
import { AuthError, getToken, resolveAccount, signOut } from './auth';

chrome.runtime.onInstalled.addListener(async (details) => {
  // Після першого встановлення відкриваємо налаштування, якщо папку ще не задано.
  if (details.reason === 'install') {
    const { rootFolderId } = await getSettings();
    if (!rootFolderId) chrome.runtime.openOptionsPage();
  }
});

/** Збереження із записом у локальний журнал операцій. */
async function saveWithLog(request: SaveRequest): Promise<SaveResult> {
  const base = { email: request.email, action: 'save' as const, subject: request.folderName };
  try {
    const res = await saveDocument(request);
    if (res.status === 'saved') await addLog({ ...base, status: 'saved', subject: res.folderName, link: res.folderUrl });
    else if (res.status === 'duplicate') await addLog({ ...base, status: 'duplicate', detail: res.duplicate.folderName });
    else await addLog({ ...base, status: 'partial', detail: res.failed.map((f) => `${f.name}: ${f.error}`).join('; '), link: res.folderUrl });
    return res;
  } catch (err) {
    await addLog({ ...base, status: 'error', detail: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

async function handle(req: BackgroundRequest): Promise<unknown> {
  switch (req.type) {
    case 'RESOLVE_ACCOUNT': {
      try {
        const email = await resolveAccount(req.accountIndex, req.interactive);
        return { signedIn: true, email } satisfies AuthStatus;
      } catch (err) {
        if (err instanceof AuthError && err.code === 'NEED_SIGN_IN') {
          return { signedIn: false, email: '' } satisfies AuthStatus;
        }
        throw err;
      }
    }
    case 'AUTH_STATUS': {
      // Тиха перевірка: без вікон, лише кеш або prompt=none.
      try {
        await getToken(req.email, false);
        return { signedIn: true, email: req.email } satisfies AuthStatus;
      } catch (err) {
        if (err instanceof AuthError && err.code === 'NEED_SIGN_IN') {
          return { signedIn: false, email: req.email } satisfies AuthStatus;
        }
        throw err;
      }
    }
    case 'SIGN_IN':
      await getToken(req.email, true);
      return { signedIn: true, email: req.email } satisfies AuthStatus;
    case 'SIGN_OUT':
      await signOut(req.email);
      return { signedIn: false, email: req.email } satisfies AuthStatus;
    case 'PREPARE_DOCUMENT':
      return (await prepareDocument(req.email, req.messageId)) satisfies PreparedDocument;
    case 'SAVE_DOCUMENT':
      return saveWithLog(req.request);
    case 'GET_SAVE_LOCATION':
      return (await getSaveLocation(req.email)) satisfies SaveLocation;
    case 'CHECK_ACCESS':
      return (await checkAccess(req.email)) satisfies AccessReport;
  }
}

chrome.runtime.onMessage.addListener((req: BackgroundRequest, _sender, sendResponse) => {
  handle(req)
    .then((data) => sendResponse({ ok: true, data } satisfies Result<unknown>))
    .catch((err: unknown) => {
      const code = err instanceof AuthError ? err.code : undefined;
      const error = err instanceof Error ? err.message : String(err);
      console.error('[docflow]', req.type, err);
      sendResponse({ ok: false, error, code } satisfies Result<unknown>);
    });
  return true; // відповідь асинхронна
});
