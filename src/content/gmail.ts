// Content script для mail.google.com.
// Визначає ID відкритого листа з DOM (не з URL — формат URL Gmail
// не збігається з ID у Gmail API) і пошту, відкриту у вкладці.
import type { ContentRequest, OpenedMessage, OpenedMessageInfo } from '../shared/messages';

/** Кожен лист ланцюжка в Gmail має атрибут data-legacy-message-id з hex-ID для Gmail API. */
const MESSAGE_SELECTOR = '[data-legacy-message-id]';
/** Контейнер тіла листа; є лише в розгорнутих листах. */
const BODY_SELECTOR = '.a3s';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/**
 * Пошта, відкрита у вкладці (найкраща спроба; Gmail змінює розмітку).
 * Якщо не вдалося — popup використає номер акаунта з URL (detectAccountIndex).
 */
function detectAccountEmail(): string | null {
  // 1. Службові дані сторінки: inline-скрипт «var GLOBALS=[…,"user@domain",…]».
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? '';
    const at = text.indexOf('GLOBALS=');
    if (at === -1) continue;
    const m = text.slice(at, at + 2000).match(EMAIL_RE);
    if (m) return m[0].toLowerCase();
  }

  // 2. Заголовок вкладки («Вхідні - user@nuwm.edu.ua - Gmail») — у частині версій Gmail.
  const fromTitle = document.title.match(EMAIL_RE);
  if (fromTitle) return fromTitle[0].toLowerCase();

  // 3. Кнопка акаунта у верхній панелі («Обліковий запис Google: Ім’я (user@…)»).
  const candidates = document.querySelectorAll<HTMLElement>(
    'a[href*="accounts.google.com"][aria-label], header [aria-label*="@"], [role="banner"] [aria-label*="@"]',
  );
  for (const el of Array.from(candidates)) {
    const m = el.getAttribute('aria-label')?.match(EMAIL_RE);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

/** Номер акаунта в URL Gmail: /mail/u/1/ → 1 (за замовчуванням 0). */
function detectAccountIndex(): number {
  const m = location.pathname.match(/\/mail\/u\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

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
  return {
    accountEmail: detectAccountEmail(),
    accountIndex: detectAccountIndex(),
    messages,
    selectedId: lastExpanded?.id ?? null,
  };
}

chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  if (msg.type === 'GET_OPENED_MESSAGE') {
    sendResponse(findOpenedMessages());
  }
  // Відповідь синхронна, тож true не повертаємо.
});
