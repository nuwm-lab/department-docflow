import { describe, expect, it } from 'vitest';
import { parseConfig } from '../storage/config';
import { classify } from './classify';

const { config } = parseConfig(
  JSON.stringify({
    rules: [
      { type: 'Наказ', subjectContains: ['наказ'] },
      { type: 'Розпорядження', subjectContains: ['розпорядження'] },
      { type: 'Вхідний лист', fromDomains: ['mon.gov.ua'] },
      { type: 'Службова записка', bodyContains: ['службова записка'] },
    ],
  }),
);
const run = (subject: string, fromEmail = 'a@nuwm.edu.ua', body = '') =>
  classify({ subject, body, fromEmail }, config.rules, config.documentTypes);

describe('classify', () => {
  it('за ключовим словом у темі (без урахування регістру)', () => {
    expect(run('НАКАЗ № 1')).toBe('Наказ');
    expect(run('Розпорядження №45')).toBe('Розпорядження');
  });

  it('за доменом відправника, зокрема піддоменом', () => {
    expect(run('Щодо акредитації', 'info@mon.gov.ua')).toBe('Вхідний лист');
    expect(run('Щодо акредитації', 'x@osvita.mon.gov.ua')).toBe('Вхідний лист');
    expect(run('Щодо акредитації', 'x@notmon.gov.ua')).toBe('Інше');
  });

  it('за словом у тілі', () => {
    expect(run('Документ', 'a@b.ua', 'Додаю. Службова записка щодо…')).toBe('Службова записка');
  });

  it('перше правило має пріоритет', () => {
    expect(run('Наказ', 'info@mon.gov.ua')).toBe('Наказ');
  });

  it('нічого не спрацювало — «Інше»', () => {
    expect(run('Привіт')).toBe('Інше');
  });
});
