import { describe, expect, it } from 'vitest';
import type { SourceDocument } from '../sources/types';
import { buildLetterMarkdown, htmlToMarkdown } from './markdown';

describe('htmlToMarkdown', () => {
  it('таблиця без <th> (як із Google Таблиць) → Markdown-таблиця', () => {
    const html =
      '<p>Список:</p><table><tbody>' +
      '<tr><td>ПІБ</td><td>Посада</td></tr>' +
      '<tr><td>Іваненко І.І.</td><td>доцент</td></tr>' +
      '<tr><td>Петренко | П.</td><td></td></tr>' +
      '</tbody></table>';
    expect(htmlToMarkdown(html)).toBe(
      ['Список:', '', '| ПІБ | Посада |', '| --- | --- |', '| Іваненко І.І. | доцент |', '| Петренко \\| П. |  |'].join(
        '\n',
      ),
    );
  });

  it('верстка листа таблицями не стає Markdown-таблицею', () => {
    const html = '<table><tr><td><table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table></td></tr></table>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('| A | B |'); // внутрішня таблиця з даними
    expect(md.match(/---/g)).toHaveLength(2); // лише один рядок-роздільник (2 колонки)
  });

  it('прибирає style, вбудовані зображення лишають підпис', () => {
    const html = '<style>p{color:red}</style><p>Текст</p><img src="cid:logo" alt="Логотип"><img src="cid:x">';
    expect(htmlToMarkdown(html)).toBe('Текст\n\n[зображення: Логотип]');
  });

  it('посилання й жирний текст', () => {
    expect(htmlToMarkdown('<p><b>Увага</b>: <a href="https://nuwm.edu.ua">сайт</a></p>')).toBe(
      '**Увага**: [сайт](https://nuwm.edu.ua)',
    );
  });
});

describe('buildLetterMarkdown', () => {
  const doc: SourceDocument = {
    source: 'gmail',
    sourceId: '1',
    threadId: '1',
    messageId: '<m@x>',
    receivedAt: '2026-11-10T12:00:00.000Z',
    from: { name: 'Деканат', email: 'dekanat@nuwm.edu.ua' },
    to: [{ name: '', email: 'kafedra@nuwm.edu.ua' }],
    cc: [],
    subject: 'Наказ № 123-к',
    html: '<p>Текст наказу</p>',
    text: null,
    attachments: [],
  };

  it('метадані на початку, далі тіло', () => {
    const md = buildLetterMarkdown(doc, ['a.pdf', 'b.pdf'], 'терміново');
    expect(md).toMatch(/^# Наказ № 123-к\n/);
    expect(md).toContain('- **Від кого:** Деканат <dekanat@nuwm.edu.ua>');
    expect(md).toContain('- **Кому:** kafedra@nuwm.edu.ua');
    expect(md).not.toContain('Копія');
    expect(md).toContain('- **Додатки:** a.pdf, b.pdf');
    expect(md).toContain('- **Примітка:** терміново');
    expect(md.trim().endsWith('Текст наказу')).toBe(true);
  });

  it('екранування лише там, де потрібно', () => {
    const md = buildLetterMarkdown({ ...doc, subject: 'План *важливо* [чернетка] _нотатка_' }, ['Звіт_2026_final.pdf']);
    expect(md).toContain('# План \\*важливо\\* \\[чернетка\\] \\_нотатка\\_');
    expect(md).toContain('- **Додатки:** Звіт_2026_final.pdf');
  });

  it('без додатків і без тексту', () => {
    const md = buildLetterMarkdown({ ...doc, html: null }, []);
    expect(md).toContain('- **Додатки:** немає');
    expect(md).toContain('_(лист без тексту)_');
  });
});
