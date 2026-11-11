// Gmail API: повний лист, ланцюжок, вкладення, оригінал .eml.
import type { GmailMessage } from '../../sources/gmail/parse';
import type { ThreadMessage } from '../../sources/types';
import { googleFetch } from './http';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailHeader {
  name: string;
  value: string;
}

/** Лист з усією структурою частин (тіло, вкладення). */
export async function getMessageFull(email: string, messageId: string): Promise<GmailMessage> {
  const res = await googleFetch(email, `${BASE}/messages/${encodeURIComponent(messageId)}?format=full`);
  return (await res.json()) as GmailMessage;
}

/** Листи ланцюжка (лише заголовки) — для вибору потрібного. */
export async function getThreadMessages(email: string, threadId: string): Promise<ThreadMessage[]> {
  const url = new URL(`${BASE}/threads/${encodeURIComponent(threadId)}`);
  url.searchParams.set('format', 'metadata');
  for (const h of ['Subject', 'From', 'Date']) url.searchParams.append('metadataHeaders', h);
  const res = await googleFetch(email, url.href);
  const thread = (await res.json()) as {
    messages?: { id: string; internalDate?: string; payload?: { headers?: GmailHeader[] } }[];
  };
  return (thread.messages ?? []).map((m) => {
    const h = (name: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? '';
    const internal = Number(m.internalDate);
    return {
      id: m.id,
      from: h('From'),
      date: Number.isFinite(internal) && internal > 0 ? new Date(internal).toISOString() : h('Date'),
      subject: h('Subject'),
    };
  });
}

/** Вміст вкладення (base64url). */
export async function getAttachmentData(email: string, messageId: string, attachmentId: string): Promise<string> {
  const res = await googleFetch(
    email,
    `${BASE}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  return ((await res.json()) as { data: string }).data;
}

/** Оригінал листа у форматі RFC 822 (.eml), base64url. */
export async function getRawMessage(email: string, messageId: string): Promise<string> {
  const res = await googleFetch(email, `${BASE}/messages/${encodeURIComponent(messageId)}?format=raw`);
  return ((await res.json()) as { raw: string }).raw;
}
