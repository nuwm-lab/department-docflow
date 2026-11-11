// Підготовка до збереження: повний лист з Gmail + налаштування й шлях на Диску.
import type { PreparedDocument } from '../shared/messages';
import { parseGmailMessage } from '../sources/gmail/parse';
import { getMessageFull, getThreadMessages } from './api/gmail';
import { loadWorkspace, saveLocationOf } from './workspace';

export async function prepareDocument(email: string, messageId: string): Promise<PreparedDocument> {
  const [message, ws] = await Promise.all([getMessageFull(email, messageId), loadWorkspace(email)]);
  const doc = parseGmailMessage(message);
  const thread = await getThreadMessages(email, doc.threadId);
  return { doc, thread, config: ws.config, location: saveLocationOf(ws) };
}
