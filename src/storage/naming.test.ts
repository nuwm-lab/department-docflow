import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { buildFolderName, sanitizeName, truncate, uniqueName } from './naming';

const T = DEFAULT_CONFIG.folderNameTemplate;

describe('buildFolderName', () => {
  it('приклад із ТЗ', () => {
    expect(
      buildFolderName(
        { date: '2026-11-10', type: 'Наказ', number: '123-к', summary: 'Про організацію навчального процесу' },
        T,
      ),
    ).toBe('2026-11-10_Наказ_№123-к_Про організацію навчального процесу');
  });

  it('без номера частина №… пропускається', () => {
    expect(buildFolderName({ date: '2026-11-11', type: 'Вхідний лист', number: '', summary: 'Щодо акредитації' }, T)).toBe(
      '2026-11-11_Вхідний лист_Щодо акредитації',
    );
  });

  it('недопустимі символи прибираються, скісні риски → дефіс', () => {
    expect(
      buildFolderName({ date: '2026-11-10', type: 'Лист', number: '1/09-12', summary: 'Що? "Так": <ні> | *' }, T),
    ).toBe('2026-11-10_Лист_№1-09-12_Що Так ні');
  });

  it('зміст обрізається до 80 символів по межі слова', () => {
    const long = 'Про затвердження положення '.repeat(10);
    const name = buildFolderName({ date: '2026-11-10', type: 'Наказ', number: '1', summary: long }, T);
    const summary = name.split('_').slice(3).join('_');
    expect(summary.length).toBeLessThanOrEqual(80);
    expect(summary.endsWith(' ')).toBe(false);
  });
});

describe('допоміжні', () => {
  it('sanitizeName прибирає кінцеві крапки', () => {
    expect(sanitizeName('Про щось...')).toBe('Про щось');
  });

  it('truncate не обрізає короткі рядки', () => {
    expect(truncate('коротко', 80)).toBe('коротко');
  });

  it('uniqueName додає _2, _3', () => {
    expect(uniqueName('A', [])).toBe('A');
    expect(uniqueName('A', ['A'])).toBe('A_2');
    expect(uniqueName('A', ['A', 'A_2'])).toBe('A_3');
  });
});
