// Підготовка до збереження: повний лист з Gmail + налаштування, шлях на Диску
// і попередня перевірка дубліката за Message-ID.
import type { PreparedDocument } from '../shared/messages';
import { parseGmailMessage } from '../sources/gmail/parse';
import { getMessageFull, getThreadMessages } from './api/gmail';
import { dedupKey, findDuplicateInRegistries } from './save';
import { loadWorkspace, saveLocationOf } from './workspace';

export async function prepareDocument(email: string, messageId: string): Promise<PreparedDocument> {
  const [message, ws] = await Promise.all([getMessageFull(email, messageId), loadWorkspace(email)]);
  const doc = parseGmailMessage(message);
  const [thread, duplicate] = await Promise.all([
    getThreadMessages(email, doc.threadId),
    // MD5 вкладень перевіряється під час збереження (потрібно завантажити файли).
    findDuplicateInRegistries(ws, dedupKey(doc), []),
  ]);
  return { doc, thread, config: ws.config, location: saveLocationOf(ws), duplicate };
}
