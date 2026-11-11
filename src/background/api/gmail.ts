// Gmail API (поки лише метадані листа — для перевірки зв’язку).
import type { MessagePreview } from '../../shared/messages';
import { googleFetch } from './http';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailHeader {
  name: string;
  value: string;
}

export async function getMessagePreview(email: string, messageId: string): Promise<MessagePreview> {
  const url = new URL(`${BASE}/messages/${encodeURIComponent(messageId)}`);
  url.searchParams.set('format', 'metadata');
  for (const h of ['Subject', 'From', 'Date']) url.searchParams.append('metadataHeaders', h);

  const res = await googleFetch(email, url.href);
  const msg = (await res.json()) as { payload?: { headers?: GmailHeader[] } };
  const header = (name: string) =>
    msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  return { subject: header('Subject'), from: header('From'), date: header('Date') };
}
