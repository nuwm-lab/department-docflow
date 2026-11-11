import { describe, expect, it } from 'vitest';
import type { SourceDocument } from '../sources/types';
import { parseConfig } from '../storage/config';
import { makeDraft } from './draft';

const { config } = parseConfig(
  JSON.stringify({ rules: [{ type: 'Вхідний лист', fromDomains: ['mon.gov.ua'] }, { type: 'Наказ', subjectContains: ['наказ'] }] }),
);

const base: SourceDocument = {
  source: 'gmail',
  sourceId: '1',
  threadId: '1',
  messageId: '<m@x>',
  receivedAt: '2026-11-11T10:00:00.000Z',
  from: { name: 'Радисюк, Вікторія', email: 'v@nuwm.edu.ua' },
  to: [],
  cc: [],
  subject: 'Наказ № 123-к від 05.11.2026 Про організацію навчального процесу',
  html: null,
  text: 'Текст',
  attachments: [],
};

describe('makeDraft', () => {
  it('звичайний лист — відправник із заголовка', () => {
    const d = makeDraft(base, config);
    expect(d).toMatchObject({ type: 'Наказ', number: '123-к', documentDate: '2026-11-05', from: 'Радисюк, Вікторія', forwardedBy: null });
    expect(d.summary).toBe('Про організацію навчального процесу');
  });

  it('пересланий лист (Gmail HTML) — справжній відправник, тип за його доменом', () => {
    const html =
      '<div dir="ltr">Переслала<br><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">' +
      '---------- Forwarded message ---------<br>From: <strong class="gmail_sendername" dir="auto">МОН України</strong> ' +
      '<span dir="auto">&lt;<a href="mailto:info@mon.gov.ua">info@mon.gov.ua</a>&gt;</span><br>Date: Mon, 10 Nov 2026<br>' +
      'Subject: Щодо акредитації<br></div><br>Текст листа МОН</div></div>';
    const d = makeDraft({ ...base, subject: 'Fwd: Щодо акредитації', text: null, html }, config);
    expect(d.from).toBe('МОН України');
    expect(d.type).toBe('Вхідний лист');
    expect(d.forwardedBy).toBe('Радисюк, Вікторія <v@nuwm.edu.ua>');
    expect(d.summary).toBe('Щодо акредитації');
  });
});
