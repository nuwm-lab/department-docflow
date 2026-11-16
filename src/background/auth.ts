// Авторизація Google через chrome.identity.launchWebAuthFlow.
//
// Чому не getAuthToken: він бере акаунт профілю Chrome, а нам потрібен акаунт,
// відкритий у вкладці Gmail (у користувача їх може бути кілька). launchWebAuthFlow
// з login_hint входить саме під потрібною поштою; працює й в інших Chromium-браузерах.
//
// Використовується неявний потік (response_type=token) з Web-клієнтом OAuth:
// redirect URI = https://<ID розширення>.chromiumapp.org/. Токени живуть ~1 год і
// кешуються в chrome.storage.session (лише в пам’яті, не на диску). Оновлення —
// тихим повторним входом (prompt=none), без участі користувача.
import { setLastEmail } from '../shared/storage';

export type AuthErrorCode = 'NEED_SIGN_IN' | 'WRONG_ACCOUNT' | 'CANCELLED' | 'FAILED';

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

interface CachedToken {
  token: string;
  expiresAt: number; // мс, Date.now()
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
/** Запас до закінчення терміну дії токена. */
const EXPIRY_MARGIN_MS = 60_000;

function oauthConfig() {
  const oauth2 = chrome.runtime.getManifest().oauth2;
  if (!oauth2?.client_id || oauth2.client_id.startsWith('REPLACE_')) {
    throw new AuthError('FAILED', 'У manifest.json не вказано OAuth Client ID');
  }
  return { clientId: oauth2.client_id, scopes: oauth2.scopes ?? [] };
}

const cacheKey = (email: string) => `token:${email.toLowerCase()}`;

async function readCache(email: string): Promise<CachedToken | null> {
  const key = cacheKey(email);
  const stored = (await chrome.storage.session.get(key))[key] as CachedToken | undefined;
  if (stored && stored.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return stored;
  return null;
}

async function writeCache(email: string, value: CachedToken): Promise<void> {
  await chrome.storage.session.set({ [cacheKey(email)]: value });
  await setLastEmail(email);
}

export async function clearCachedToken(email: string): Promise<void> {
  await chrome.storage.session.remove(cacheKey(email));
}

/** Яким акаунтом входити: за поштою (login_hint) або за номером акаунта Gmail (authuser). */
type AccountHint = { email: string } | { accountIndex: number };

/** Один прохід OAuth. interactive=false — тихо, без вікон (prompt=none). */
async function launchFlow(hint: AccountHint, interactive: boolean): Promise<CachedToken> {
  const { clientId, scopes } = oauthConfig();
  const state = crypto.randomUUID();

  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', chrome.identity.getRedirectURL());
  url.searchParams.set('scope', scopes.join(' '));
  if ('email' in hint) url.searchParams.set('login_hint', hint.email);
  else url.searchParams.set('authuser', String(hint.accountIndex));
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  if (!interactive) url.searchParams.set('prompt', 'none');

  let redirect: string | undefined;
  try {
    redirect = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive });
  } catch (err) {
    if (!interactive) throw new AuthError('NEED_SIGN_IN', 'Потрібно увійти в Google');
    const msg = String(err);
    if (/did not approve|closed|cancel/i.test(msg)) {
      throw new AuthError('CANCELLED', 'Вхід скасовано');
    }
    throw new AuthError('FAILED', `Не вдалося увійти в Google: ${msg}`);
  }
  if (!redirect) throw new AuthError('FAILED', 'Google не повернув відповідь');

  const params = new URLSearchParams(new URL(redirect).hash.slice(1));
  const error = params.get('error');
  if (error) {
    if (!interactive) throw new AuthError('NEED_SIGN_IN', 'Потрібно увійти в Google');
    if (error === 'access_denied') throw new AuthError('CANCELLED', 'Доступ не надано');
    throw new AuthError('FAILED', `Помилка входу Google: ${error}`);
  }
  if (params.get('state') !== state) {
    throw new AuthError('FAILED', 'Відповідь Google не пройшла перевірку (state)');
  }

  const token = params.get('access_token');
  const expiresIn = Number(params.get('expires_in') ?? '3600');
  if (!token) throw new AuthError('FAILED', 'Google не видав токен доступу');
  return { token, expiresAt: Date.now() + expiresIn * 1000 };
}

/** Пошта, для якої виданий токен (за Gmail API). */
async function fetchTokenEmail(token: string): Promise<string> {
  const res = await fetch(PROFILE_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new AuthError('FAILED', `Не вдалося перевірити акаунт (HTTP ${res.status})`);
  const { emailAddress } = (await res.json()) as { emailAddress: string };
  return emailAddress.toLowerCase();
}

/** Перевіряє, що токен виданий саме для потрібної пошти. */
async function verifyAccount(email: string, token: string): Promise<void> {
  const emailAddress = await fetchTokenEmail(token);
  if (emailAddress !== email.toLowerCase()) {
    throw new AuthError(
      'WRONG_ACCOUNT',
      `Вхід виконано як ${emailAddress}, а у вкладці Gmail відкрита ${email}. ` +
        `Увійдіть під ${email}.`,
    );
  }
}

/**
 * Повертає дійсний токен для пошти email.
 * interactive=true — за потреби покаже вікно входу Google.
 */
export async function getToken(email: string, interactive = false): Promise<string> {
  const cached = await readCache(email);
  if (cached) return cached.token;

  const fresh = await launchWithFallback({ email }, interactive);
  await verifyAccount(email, fresh.token);
  await writeCache(email, fresh);
  return fresh.token;
}

/** Спершу тихо; якщо потрібен вхід і дозволено — з вікном Google. */
async function launchWithFallback(hint: AccountHint, interactive: boolean): Promise<CachedToken> {
  try {
    return await launchFlow(hint, false);
  } catch (err) {
    if (!(err instanceof AuthError) || err.code !== 'NEED_SIGN_IN' || !interactive) throw err;
    return launchFlow(hint, true);
  }
}

const indexKey = (accountIndex: number) => `account:u${accountIndex}`;

/**
 * Визначає пошту за номером акаунта Gmail (/mail/u/N/), коли з DOM її не видно:
 * входить з authuser=N і питає Gmail API, чия це скринька. Токен кешується за поштою.
 */
export async function resolveAccount(accountIndex: number, interactive = false): Promise<string> {
  const key = indexKey(accountIndex);
  const known = (await chrome.storage.session.get(key))[key] as string | undefined;
  if (known && (await readCache(known))) return known;

  const fresh = await launchWithFallback({ accountIndex }, interactive);
  const email = await fetchTokenEmail(fresh.token);
  await writeCache(email, fresh);
  await chrome.storage.session.set({ [key]: email });
  return email;
}

/** Вийти: відкликати токен у Google і прибрати з кешу. */
export async function signOut(email: string): Promise<void> {
  const cached = await readCache(email);
  await clearCachedToken(email);
  if (cached) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(cached.token)}`, { method: 'POST' }).catch(
      () => undefined, // відкликання — найкраща спроба; токен однаково видалено з кешу
    );
  }
}
