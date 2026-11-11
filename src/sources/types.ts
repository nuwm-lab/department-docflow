// Уніфікована модель вхідного документа: «джерело → модель → сховище».
// Джерело Gmail (зараз) і СЕД (етап 3) перетворюють свої дані саме в цю модель,
// тож збереження на Диск і реєстр від джерела не залежать.
// Лише JSON-сумісні типи — модель передається між popup і service worker.

export interface Address {
  name: string;
  email: string;
}

export interface SourceAttachment {
  /**
   * Стабільний ідентифікатор вкладення в межах листа (у Gmail — partId).
   * Не attachmentId: Gmail генерує його заново при кожному запиті листа.
   */
  id: string;
  /** Ідентифікатор для завантаження вмісту (у Gmail — attachmentId; дійсний лише для цього запиту). */
  downloadId?: string;
  filename: string;
  mimeType: string;
  /** Розмір у байтах (як повідомляє джерело). */
  size: number;
  /** Вбудоване зображення (логотип у підписі тощо) — за замовчуванням не зберігається. */
  inline: boolean;
  /** Вміст у base64url, якщо джерело віддало його одразу (дрібні частини Gmail). */
  data?: string;
}

export interface SourceDocument {
  source: 'gmail';
  /** ID у джерелі (Gmail API message id). */
  sourceId: string;
  threadId: string;
  /** Заголовок Message-ID — ключ перевірки дублікатів. */
  messageId: string;
  /** Час надходження, ISO 8601. */
  receivedAt: string;
  from: Address;
  to: Address[];
  cc: Address[];
  subject: string;
  html: string | null;
  text: string | null;
  attachments: SourceAttachment[];
}

/** Лист ланцюжка — для вибору, якщо в ланцюжку кілька листів. */
export interface ThreadMessage {
  id: string;
  from: string;
  date: string;
  subject: string;
}
