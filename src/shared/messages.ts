// Типи повідомлень між частинами розширення (popup ↔ content script ↔ service worker).

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

/** Короткі відомості про лист з Gmail API (для перевірки зв’язку). */
export interface MessagePreview {
  subject: string;
  from: string;
  date: string;
}

export interface AuthStatus {
  signedIn: boolean;
  email: string;
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
  | { type: 'GET_MESSAGE_PREVIEW'; email: string; messageId: string };

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
