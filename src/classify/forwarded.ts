// Справжній відправник пересланого листа.
// Діловоду накази часто приходять пересланими: у заголовку From — той, хто переслав,
// а відправник документа (деканат, МОН…) — у блоці пересилання в тексті листа.
import { parseAddress } from '../sources/gmail/parse';
import type { Address } from '../sources/types';

/** Рядок-роздільник пересилання: «---------- Forwarded message ---------», «-----Original Message-----» тощо. */
const MARKER = /-{2,}.*(forward|original message|пересл|пересил|переадрес|исходное|пересланное).*-{2,}/i;
/** Рядок відправника в блоці пересилання. */
const FROM_LINE = /^[\s>*]*(?:from|від кого|від|от|відправник)\s*:\s*(.+)$/i;
/** Рядок дати в заголовку Outlook без роздільника («From: …» → «Sent: …»). */
const SENT_LINE = /^[\s>*]*(?:sent|date|дата|надіслано|отправлено)\s*:/i;
/** Тема з префіксом пересилання. */
const FORWARD_SUBJECT = /^\s*(?:fwd?|fw|пересл\S*)\s*:/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** «Деканат <d@x.ua>», «Деканат [mailto:d@x.ua]», «d@x.ua», «Деканат ННІ». */
function parseSender(value: string): Address | null {
  const v = value.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
  if (!v) return null;
  if (/<[^>]*@[^>]*>/.test(v)) {
    const a = parseAddress(v.replace(/<\s+/g, '<').replace(/\s+>/g, '>'));
    return a.email ? a : null;
  }
  const email = v.match(EMAIL)?.[0];
  if (!email) return { name: v.replace(/^["']|["']$/g, ''), email: '' };
  const name = v
    .replace(/\[?mailto:[^\]\s]*\]?/i, '')
    .replace(email, '')
    .replace(/[<>()[\]"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { name, email: email.toLowerCase() };
}

/**
 * Відправник із блоку пересилання в тексті листа; null — лист не пересланий.
 * Якщо лист пересилали кілька разів, повертає найглибшого (першоджерело).
 */
export function findForwardedSender(text: string, subject: string): Address | null {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
  const candidates: number[] = [];

  lines.forEach((line, i) => {
    if (!MARKER.test(line)) return;
    for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
      if (FROM_LINE.test(lines[j])) {
        candidates.push(j);
        return;
      }
    }
  });

  // Outlook часто пише заголовок без роздільника: «From: …» і одразу «Sent: …».
  // Без роздільника довіряємо лише листам з темою «Fwd:/FW:», щоб не сплутати з цитатою у відповіді.
  if (!candidates.length && FORWARD_SUBJECT.test(subject)) {
    lines.forEach((line, i) => {
      if (FROM_LINE.test(line) && lines.slice(i + 1, i + 5).some((l) => SENT_LINE.test(l))) candidates.push(i);
    });
  }

  for (const i of candidates.reverse()) {
    const sender = parseSender(lines[i].match(FROM_LINE)![1]);
    if (sender) return sender;
  }
  return null;
}
