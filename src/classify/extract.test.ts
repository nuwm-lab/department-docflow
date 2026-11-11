import { describe, expect, it } from 'vitest';
import { buildSummary, cleanSubject, findDocumentDate, findNumber } from './extract';

const SUBJECT = 'Наказ № 123-к від 05.11.2026 Про організацію навчального процесу';

describe('cleanSubject', () => {
  it('прибирає Re:/Fwd:/Fw: (зокрема повторені)', () => {
    expect(cleanSubject('Fwd: Re: FW:  Наказ')).toBe('Наказ');
    expect(cleanSubject('RE[2]: Розпорядження')).toBe('Розпорядження');
    expect(cleanSubject('Відп: Пересл: Лист')).toBe('Лист');
  });

  it('не чіпає слова, що лише починаються як префікс', () => {
    expect(cleanSubject('Report: план')).toBe('Report: план');
  });
});

describe('findNumber', () => {
  it('знаходить номер після №', () => {
    expect(findNumber([SUBJECT])).toBe('123-к');
    expect(findNumber(['Розпорядження №45 про чергування'])).toBe('45');
    expect(findNumber(['лист №1/09-1234 від'])).toBe('1/09-1234');
  });

  it('шукає в наступних текстах, якщо в темі немає', () => {
    expect(findNumber(['Про чергування', ''])).toBeNull();
    expect(findNumber(['Про чергування', 'Наказ №77.pdf'])).toBe('77');
    expect(findNumber(['Про чергування', 'Наказ_№_77_Додаток.docx'])).toBe('77');
  });

  it('прибирає кінцеву крапку, ігнорує № без цифр', () => {
    expect(findNumber(['наказом № 15.'])).toBe('15');
    expect(findNumber(['№ п/п'])).toBeNull();
  });
});

describe('findDocumentDate', () => {
  it('«від ДД.ММ.РРРР»', () => {
    expect(findDocumentDate(SUBJECT, [])).toBe('2026-11-05');
  });

  it('«від 5 листопада 2026 року»', () => {
    expect(findDocumentDate('Наказ', ['наказ № 12 від 5 листопада 2026 року'])).toBe('2026-11-05');
  });

  it('будь-яка дата в темі, але не в тілі без «від»', () => {
    expect(findDocumentDate('Протокол 03.10.2026', [])).toBe('2026-10-03');
    expect(findDocumentDate('Протокол', ['засідання 03.10.2026'])).toBeNull();
  });

  it('некоректна дата ігнорується', () => {
    expect(findDocumentDate('від 31.02.2026', [])).toBeNull();
  });
});

describe('buildSummary', () => {
  it('тема без типу, номера й дати, з великої літери', () => {
    expect(buildSummary(SUBJECT, 'Наказ')).toBe('Про організацію навчального процесу');
    expect(buildSummary('Fwd: Розпорядження №45 про чергування', 'Розпорядження')).toBe('Про чергування');
  });

  it('якщо після очищення нічого не лишилось — повна тема', () => {
    expect(buildSummary('Наказ № 5', 'Наказ')).toBe('Наказ № 5');
  });

  it('тип «Інше» не вирізається з теми', () => {
    expect(buildSummary('Щодо акредитації', 'Інше')).toBe('Щодо акредитації');
  });
});
