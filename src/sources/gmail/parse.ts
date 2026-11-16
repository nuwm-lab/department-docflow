// Перетворення відповіді Gmail API (messages.get, format=full) в уніфіковану модель.
// Чисті функції без звернень до мережі — покриті тестами.
import type { Address, SourceAttachment, SourceDocument } from '../types';

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

const header = (headers: GmailHeader[] | undefined, name: string) =>
  headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

/** base64url → байти. */
export function base64UrlToBytes(data: string): Uint8Array {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Декодує текстову частину листа з урахуванням charset (utf-8, windows-1251, koi8-u…). */
function decodeText(data: string, contentType: string): string {
  const charset = contentType.match(/charset="?([^";\s]+)"?/i)?.[1] ?? 'utf-8';
  const bytes = base64UrlToBytes(data);
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Розділяє список адрес за комами, що не всередині лапок чи <…>. */
function splitAddresses(value: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let angle = false;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    else if (ch === '<' && !quoted) angle = true;
    else if (ch === '>' && !quoted) angle = false;
    if (ch === ',' && !quoted && !angle) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

export function parseAddress(value: string): Address {
  const m = value.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"').trim();
    return { name, email: m[2].trim().toLowerCase() };
  }
  return { name: '', email: value.trim().replace(/^<|>$/g, '').toLowerCase() };
}

export const parseAddressList = (value: string): Address[] => splitAddresses(value).map(parseAddress);

/** «Ім’я <адреса>» або лише адреса. */
export const formatAddress = (a: Address) => (a.name ? `${a.name} <${a.email}>` : a.email);

export function parseGmailMessage(msg: GmailMessage): SourceDocument {
  const payload = msg.payload ?? {};
  const headers = payload.headers;
  let html: string | null = null;
  let text: string | null = null;
  const attachments: SourceAttachment[] = [];

  const walk = (part: GmailMessagePart) => {
    if (part.parts?.length) {
      part.parts.forEach(walk);
      return;
    }
    const mime = (part.mimeType ?? '').toLowerCase();
    const disposition = header(part.headers, 'Content-Disposition');
    const contentId = header(part.headers, 'Content-ID');
    const isAttachment =
      !!part.filename || /^attachment/i.test(disposition) || (!!part.body?.attachmentId && !mime.startsWith('text/'));

    if (isAttachment) {
      const attachmentId = part.body?.attachmentId;
      attachments.push({
        // partId стабільний між запитами, attachmentId — ні.
        id: `part:${part.partId ?? attachments.length}`,
        filename: part.filename || `додаток-${attachments.length + 1}`,
        mimeType: mime || 'application/octet-stream',
        size: part.body?.size ?? 0,
        inline: !!contentId && !/^attachment/i.test(disposition),
        ...(attachmentId ? { downloadId: attachmentId } : { data: part.body?.data ?? '' }),
      });
      return;
    }

    const data = part.body?.data;
    if (!data) return;
    const contentType = header(part.headers, 'Content-Type');
    if (mime === 'text/html' && html === null) html = decodeText(data, contentType);
    else if (mime === 'text/plain' && text === null) text = decodeText(data, contentType);
  };
  walk(payload);

  const internal = Number(msg.internalDate);
  const receivedAt = Number.isFinite(internal) && internal > 0
    ? new Date(internal).toISOString()
    : new Date(header(headers, 'Date') || Date.now()).toISOString();

  return {
    source: 'gmail',
    sourceId: msg.id,
    threadId: msg.threadId,
    messageId: header(headers, 'Message-ID') || header(headers, 'Message-Id'),
    receivedAt,
    from: parseAddress(header(headers, 'From')),
    to: parseAddressList(header(headers, 'To')),
    cc: parseAddressList(header(headers, 'Cc')),
    subject: header(headers, 'Subject'),
    html,
    text,
    attachments,
  };
}
