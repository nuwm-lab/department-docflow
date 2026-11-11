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
  /** Усі листи відкритого ланцюжка (порожньо, якщо лист не відкрито). */
  messages: OpenedMessage[];
  /** ID листа за замовчуванням — останній розгорнутий. */
  selectedId: string | null;
}

export type Request =
  | { type: 'GET_OPENED_MESSAGE' }
  | { type: 'PING' };

export type PingResponse = { ok: true; version: string };
