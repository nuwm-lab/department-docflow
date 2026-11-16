import { describe, expect, it } from 'vitest';
import { buildRow, columnLetter, COLUMNS, findDuplicate, rowFromRange, type RegistryEntry } from './registry';

const entry: RegistryEntry = {
  receivedDate: '2026-11-11',
  type: 'Наказ',
  number: '1/09-12',
  documentDate: '2026-11-05',
  from: 'Деканат',
  summary: '=Про "щось"',
  note: '',
  attachmentCount: 2,
  folderUrl: 'https://drive.google.com/drive/folders/abc',
  folderName: '2026-11-11_Наказ_№1-09-12_"Про"',
  savedBy: 'user@nuwm.edu.ua',
  savedAt: new Date(2026, 10, 11, 14, 5, 9),
  messageId: '<m1@mail.gmail.com>',
  md5: ['bbb', 'aaa'],
};

describe('buildRow', () => {
  const row = buildRow(entry);
  const cell = (name: (typeof COLUMNS)[number]) => row[COLUMNS.indexOf(name)];

  it('стільки значень, скільки колонок', () => {
    expect(row).toHaveLength(COLUMNS.length);
  });

  it('№ рахує таблиця формулою (безпечно при одночасному збереженні)', () => {
    expect(cell('№')).toBe('=ROW()-1');
  });

  it('текстові поля з апострофом: «1/09-12» не стане датою, «=…» не стане формулою', () => {
    expect(cell('№ документа')).toBe("'1/09-12");
    expect(cell('Короткий зміст')).toBe('\'=Про "щось"');
    expect(cell('Примітка')).toBe('');
  });

  it('папка — адреса без формул (формули залежать від локалі таблиці)', () => {
    expect(cell('Папка')).toBe('https://drive.google.com/drive/folders/abc');
    expect(row.filter((v) => typeof v === 'string' && v.startsWith('=') && v !== '=ROW()-1')).toEqual([]);
  });

  it('дата/час збереження, відсортовані MD5', () => {
    expect(cell('Коли збережено')).toBe('2026-11-11 14:05:09');
    expect(cell('MD5 вкладень')).toBe("'aaa bbb");
    expect(cell('Додатків')).toBe(2);
  });
});

describe('findDuplicate', () => {
  const header = [...COLUMNS];
  const r = (msg: string, md5: string, savedAt = '2026-11-10 10:00:00') =>
    COLUMNS.map((c) =>
      c === 'Message-ID' ? msg : c === 'MD5 вкладень' ? md5 : c === 'Коли збережено' ? savedAt : c === 'Зберіг' ? 'a@b' : c === 'Папка' ? 'Папка 1' : '',
    );
  const values = [header, r('<x@y>', 'aaa'), r('<m1@mail.gmail.com>', 'ccc', '2026-11-09 09:00:00')];

  it('за Message-ID (номер рядка з урахуванням заголовка)', () => {
    expect(findDuplicate(values, '<m1@mail.gmail.com>', [])).toEqual({
      row: 3,
      by: 'message-id',
      savedAt: '2026-11-09 09:00:00',
      savedBy: 'a@b',
      folderName: 'Папка 1',
    });
  });

  it('за MD5, якщо Message-ID інший', () => {
    expect(findDuplicate(values, '<new@y>', ['zzz', 'aaa'])?.by).toBe('md5');
    expect(findDuplicate(values, '<new@y>', ['aaa'])?.row).toBe(2);
  });

  it('Message-ID має пріоритет над MD5', () => {
    expect(findDuplicate(values, '<m1@mail.gmail.com>', ['aaa'])?.by).toBe('message-id');
  });

  it('немає збігів / порожній реєстр', () => {
    expect(findDuplicate(values, '<new@y>', ['zzz'])).toBeNull();
    expect(findDuplicate([], '<x@y>', [])).toBeNull();
    expect(findDuplicate([header], '<x@y>', [])).toBeNull();
  });

  it('колонки шукаються за назвою (порядок може змінитися)', () => {
    const reordered = [['Message-ID', 'Зберіг'], ['<q@w>', 'хтось']];
    expect(findDuplicate(reordered, '<q@w>', [])?.savedBy).toBe('хтось');
  });
});

describe('rowFromRange', () => {
  it('номер рядка з відповіді append', () => {
    expect(rowFromRange("'Реєстр'!A5:N5")).toBe(5);
    expect(rowFromRange('Sheet1!A12:N12')).toBe(12);
    expect(rowFromRange('')).toBeNull();
  });
});

describe('columnLetter', () => {
  it('A, Z, AA', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
  });
});
