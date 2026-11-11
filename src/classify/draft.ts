// Чернетка реквізитів документа для вікна збереження: усе визначено автоматично,
// користувач може змінити будь-яке поле.
import type { SourceDocument } from '../sources/types';
import type { DocflowConfig } from '../storage/config';
import { classify } from './classify';
import { buildSummary, cleanSubject, findDocumentDate, findNumber } from './extract';

export interface DocumentDraft {
  type: string;
  /** № документа (порожньо, якщо не знайдено). */
  number: string;
  /** Дата документа, РРРР-ММ-ДД (порожньо, якщо не знайдено). */
  documentDate: string;
  /** Від кого: ім’я відправника або адреса. */
  from: string;
  summary: string;
  note: string;
}

/** Текст листа без HTML (для правил і пошуку реквізитів). */
export function plainText(doc: SourceDocument): string {
  if (doc.text) return doc.text;
  if (!doc.html) return '';
  return doc.html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ');
}

/** Скільки символів тіла листа переглядати для пошуку номера й дати. */
const BODY_SCAN_LIMIT = 5000;

export function makeDraft(doc: SourceDocument, config: DocflowConfig): DocumentDraft {
  const body = plainText(doc);
  const subject = cleanSubject(doc.subject);
  const filenames = doc.attachments.filter((a) => !a.inline).map((a) => a.filename);
  const bodyHead = body.slice(0, BODY_SCAN_LIMIT);

  const type = classify({ subject, body, fromEmail: doc.from.email }, config.rules, config.documentTypes);

  return {
    type,
    number: findNumber([subject, ...filenames, bodyHead]) ?? '',
    documentDate: findDocumentDate(subject, [...filenames, bodyHead]) ?? '',
    from: doc.from.name || doc.from.email,
    summary: buildSummary(doc.subject, type),
    note: '',
  };
}
