// Content script для mail.google.com.
// Визначає ID відкритого листа з DOM (не з URL — формат URL Gmail
// не збігається з ID у Gmail API) і віддає його popup на запит.
import type { OpenedMessage, OpenedMessageInfo, Request } from '../shared/messages';

/** Кожен лист ланцюжка в Gmail має атрибут data-legacy-message-id з hex-ID для Gmail API. */
const MESSAGE_SELECTOR = '[data-legacy-message-id]';
/** Контейнер тіла листа; є лише в розгорнутих листах. */
const BODY_SELECTOR = '.a3s';

function findOpenedMessages(): OpenedMessageInfo {
  const seen = new Map<string, OpenedMessage>();
  document.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR).forEach((el) => {
    const id = el.getAttribute('data-legacy-message-id');
    if (!id) return;
    const body = el.querySelector<HTMLElement>(BODY_SELECTOR);
    const expanded = !!body && body.offsetParent !== null;
    const prev = seen.get(id);
    seen.set(id, { id, expanded: expanded || !!prev?.expanded });
  });

  const messages = [...seen.values()];
  const lastExpanded = [...messages].reverse().find((m) => m.expanded);
  return { messages, selectedId: lastExpanded?.id ?? null };
}

chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
  if (msg.type === 'GET_OPENED_MESSAGE') {
    sendResponse(findOpenedMessages());
  }
  // Відповідь синхронна, тож true не повертаємо.
});
