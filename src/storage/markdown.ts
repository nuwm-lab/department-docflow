// Лист.md: блок метаданих + тіло листа, конвертоване з HTML у Markdown (п. 5.4 ТЗ).
// Працює там, де є DOM (popup); у тестах Turndown використовує вбудований парсер.
import TurndownService from 'turndown';
import { formatAddress } from '../sources/gmail/parse';
import type { SourceDocument } from '../sources/types';

/** Таблиця з даними (а не верстка листа): без вкладених таблиць, ≥2 рядки і ≥2 колонки. */
function isDataTable(table: HTMLTableElement): boolean {
  if (table.querySelector('table')) return false;
  const rows = Array.from(table.rows);
  if (rows.length < 2) return false;
  return Math.max(...rows.map((r) => r.cells.length)) >= 2;
}

const cellText = (cell: HTMLTableCellElement) =>
  (cell.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');

/** Markdown-таблиця; перший рядок завжди стає заголовком (у листах <th> рідко буває). */
function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.rows).map((r) => Array.from(r.cells).map(cellText));
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array<string>(width - r.length).fill('')];
  const line = (r: string[]) => `| ${pad(r).join(' | ')} |`;
  const [head, ...body] = rows;
  return [line(head), `| ${Array<string>(width).fill('---').join(' | ')} |`, ...body.map(line)].join('\n');
}

let service: TurndownService | null = null;

function turndown(): TurndownService {
  if (service) return service;
  service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
  });
  service.remove(['style', 'script', 'head', 'title', 'meta']);

  service.addRule('dataTable', {
    filter: (node) => node.nodeName === 'TABLE' && isDataTable(node as HTMLTableElement),
    replacement: (_content, node) => `\n\n${tableToMarkdown(node as HTMLTableElement)}\n\n`,
  });

  // Вбудовані зображення (cid:, data:) у .md не відкриються — лишаємо лише підпис.
  service.addRule('inlineImage', {
    filter: (node) => {
      if (node.nodeName !== 'IMG') return false;
      const src = (node as HTMLImageElement).getAttribute('src') ?? '';
      return src.startsWith('cid:') || src.startsWith('data:');
    },
    replacement: (_content, node) => {
      const alt = (node as HTMLImageElement).getAttribute('alt')?.trim();
      return alt ? `[зображення: ${alt}]` : '';
    },
  });
  return service;
}

export function htmlToMarkdown(html: string): string {
  return turndown()
    .turndown(html)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Мінімальне екранування значень метаданих, щоб «*» чи «[…]» у темі не стали розміткою.
 * «_» усередині слова (radysiuk_ak22, Свідоцтво_досягнень) розміткою не є — не чіпаємо;
 * «<адреса>» — коректне посилання на пошту в Markdown.
 */
const esc = (s: string) =>
  s.replace(/([\\`*[\]])/g, '\\$1').replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_');

export function buildLetterMarkdown(doc: SourceDocument, attachmentNames: string[], note = ''): string {
  const meta = [
    `- **Від кого:** ${esc(formatAddress(doc.from))}`,
    doc.to.length ? `- **Кому:** ${esc(doc.to.map(formatAddress).join(', '))}` : null,
    doc.cc.length ? `- **Копія:** ${esc(doc.cc.map(formatAddress).join(', '))}` : null,
    `- **Дата:** ${formatDateTime(doc.receivedAt)}`,
    `- **Тема:** ${esc(doc.subject || '(без теми)')}`,
    `- **Додатки:** ${attachmentNames.length ? esc(attachmentNames.join(', ')) : 'немає'}`,
    note.trim() ? `- **Примітка:** ${esc(note.trim())}` : null,
  ].filter(Boolean);

  const body = doc.html ? htmlToMarkdown(doc.html) : (doc.text ?? '').trim();

  return [`# ${esc(doc.subject || '(без теми)')}`, '', ...meta, '', '---', '', body || '_(лист без тексту)_', ''].join(
    '\n',
  );
}
