// Service worker розширення: авторизація Google і запити до API.
import type { AuthStatus, BackgroundRequest, MessagePreview, Result } from '../shared/messages';
import { getSettings } from '../shared/storage';
import { getMessagePreview } from './api/gmail';
import { AuthError, getToken, resolveAccount, signOut } from './auth';

chrome.runtime.onInstalled.addListener(async (details) => {
  // Після першого встановлення відкриваємо налаштування, якщо папку ще не задано.
  if (details.reason === 'install') {
    const { rootFolderId } = await getSettings();
    if (!rootFolderId) chrome.runtime.openOptionsPage();
  }
});

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
    case 'GET_MESSAGE_PREVIEW':
      return (await getMessagePreview(req.email, req.messageId)) satisfies MessagePreview;
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
