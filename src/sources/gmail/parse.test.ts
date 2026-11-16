import { describe, expect, it } from 'vitest';
import { parseAddress, parseAddressList, parseGmailMessage, type GmailMessage } from './parse';

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const message: GmailMessage = {
  id: '19a1b2c3',
  threadId: '19a1b2c0',
  internalDate: String(Date.UTC(2026, 10, 10, 12, 0)),
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'From', value: '"Деканат, ННІ" <Dekanat@nuwm.edu.ua>' },
      { name: 'To', value: 'kafedra@nuwm.edu.ua, "Іваненко І." <ivan@nuwm.edu.ua>' },
      { name: 'Subject', value: 'Наказ № 123-к' },
      { name: 'Message-ID', value: '<abc@mail.gmail.com>' },
    ],
    parts: [
      {
        mimeType: 'multipart/alternative',
        parts: [
          {
            mimeType: 'text/plain',
            headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
            body: { data: b64url('Текст листа') },
          },
          {
            mimeType: 'text/html',
            headers: [{ name: 'Content-Type', value: 'text/html; charset=UTF-8' }],
            body: { data: b64url('<p>Текст <b>листа</b></p>') },
          },
        ],
      },
      {
        partId: '2',
        mimeType: 'application/pdf',
        filename: 'Наказ_123-к.pdf',
        headers: [{ name: 'Content-Disposition', value: 'attachment; filename="Наказ_123-к.pdf"' }],
        body: { attachmentId: 'ATT1', size: 20480 },
      },
      {
        partId: '3',
        mimeType: 'image/png',
        filename: 'logo.png',
        headers: [
          { name: 'Content-Disposition', value: 'inline; filename="logo.png"' },
          { name: 'Content-ID', value: '<logo>' },
        ],
        body: { attachmentId: 'ATT2', size: 1024 },
      },
    ],
  },
};

describe('parseGmailMessage', () => {
  const doc = parseGmailMessage(message);

  it('метадані', () => {
    expect(doc.messageId).toBe('<abc@mail.gmail.com>');
    expect(doc.subject).toBe('Наказ № 123-к');
    expect(doc.receivedAt).toBe('2026-11-10T12:00:00.000Z');
    expect(doc.from).toEqual({ name: 'Деканат, ННІ', email: 'dekanat@nuwm.edu.ua' });
    expect(doc.to).toHaveLength(2);
  });

  it('тіло в HTML і тексті (UTF-8)', () => {
    expect(doc.text).toBe('Текст листа');
    expect(doc.html).toBe('<p>Текст <b>листа</b></p>');
  });

  it('вкладення; вбудоване зображення позначене inline', () => {
    expect(doc.attachments).toEqual([
      { id: 'part:2', downloadId: 'ATT1', filename: 'Наказ_123-к.pdf', mimeType: 'application/pdf', size: 20480, inline: false },
      { id: 'part:3', downloadId: 'ATT2', filename: 'logo.png', mimeType: 'image/png', size: 1024, inline: true },
    ]);
  });

  it('ID вкладень стабільні, хоча Gmail щоразу видає новий attachmentId', () => {
    const again = structuredClone(message);
    again.payload!.parts![1].body!.attachmentId = 'ATT1-NEW';
    expect(parseGmailMessage(again).attachments.map((a) => a.id)).toEqual(doc.attachments.map((a) => a.id));
  });
});

describe('адреси', () => {
  it('ім’я в лапках з комою', () => {
    expect(parseAddressList('"Петренко, П." <p@x.ua>, q@x.ua')).toEqual([
      { name: 'Петренко, П.', email: 'p@x.ua' },
      { name: '', email: 'q@x.ua' },
    ]);
  });

  it('лише адреса', () => {
    expect(parseAddress('<A@B.UA>')).toEqual({ name: '', email: 'a@b.ua' });
  });
});
