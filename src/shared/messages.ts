// Типи повідомлень між частинами розширення (popup ↔ content script ↔ service worker).
import type { SourceDocument, ThreadMessage } from '../sources/types';
import type { DocflowConfig } from '../storage/config';

/** Лист, знайдений у відкритому ланцюжку Gmail. */
export interface OpenedMessage {
  /** ID листа у форматі Gmail API (hex), з атрибута data-legacy-message-id. */
  id: string;
  /** Чи розгорнутий лист (видно тіло). */
  expanded: boolean;
}

/** Відповідь content script про стан відкритої вкладки Gmail. */
export interface OpenedMessageInfo {
  /** Пошта, відкрита у вкладці Gmail (null, якщо не вдалося визначити). */
  accountEmail: string | null;
  /** Номер акаунта Gmail з URL (/mail/u/N/) — запасний спосіб, якщо пошту не визначено. */
  accountIndex: number;
  /** Усі листи відкритого ланцюжка (порожньо, якщо лист не відкрито). */
  messages: OpenedMessage[];
  /** ID листа за замовчуванням — останній розгорнутий. */
  selectedId: string | null;
}

/** Усе для вікна збереження: лист у єдиній моделі, листи ланцюжка, налаштування, шлях. */
export interface PreparedDocument {
  doc: SourceDocument;
  thread: ThreadMessage[];
  config: DocflowConfig;
  location: SaveLocation;
}

export interface AuthStatus {
  signedIn: boolean;
  email: string;
}

/** Куди буде збережено документ (для показу в popup). */
export interface SaveLocation {
  /** «Вхідна документація / 2026-2027». */
  path: string;
  rootLink: string;
  /** false — папку року буде створено під час першого збереження. */
  yearExists: boolean;
}

/** Один пункт звіту «Перевірити доступ». */
export interface AccessCheckItem {
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  link?: string;
}

export interface AccessReport {
  items: AccessCheckItem[];
  /** true — помилок немає (попередження допустимі). */
  ok: boolean;
}

/** Запити до content script. */
export type ContentRequest = { type: 'GET_OPENED_MESSAGE' };

/** Запити до service worker. */
export type BackgroundRequest =
  /** Визначити пошту за номером акаунта Gmail (коли з DOM не вдалося). Відповідь — AuthStatus. */
  | { type: 'RESOLVE_ACCOUNT'; accountIndex: number; interactive: boolean }
  | { type: 'AUTH_STATUS'; email: string }
  | { type: 'SIGN_IN'; email: string }
  | { type: 'SIGN_OUT'; email: string }
  | { type: 'PREPARE_DOCUMENT'; email: string; messageId: string }
  | { type: 'GET_SAVE_LOCATION'; email: string }
  | { type: 'CHECK_ACCESS'; email: string };

/** Уніфікована відповідь service worker. */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

/** Надіслати запит service worker і отримати типізовану відповідь. */
export async function callBackground<T>(req: BackgroundRequest): Promise<Result<T>> {
  try {
    const res = (await chrome.runtime.sendMessage(req)) as Result<T> | undefined;
    // undefined — фонова частина не обробила запит (зазвичай стара версія після оновлення).
    if (!res) {
      return {
        ok: false,
        error:
          'Фонова частина розширення не відповіла. Перезапустіть розширення на chrome://extensions ' +
          '(вимкнути й увімкнути) та оновіть вкладку Gmail.',
      };
    }
    return res;
  } catch (err) {
    return { ok: false, error: `Розширення не відповідає: ${String(err)}` };
  }
}
