// Реєстр вхідних документів (Google Таблиця в папці року, п. 5.5 ТЗ):
// колонки, рядок для додавання, пошук дублікатів. Чисті функції — покриті тестами.

export const REGISTRY_SHEET_TITLE = 'Реєстр';

export const COLUMNS = [
  '№',
  'Дата надходження',
  'Тип',
  '№ документа',
  'Дата документа',
  'Від кого',
  'Короткий зміст',
  'Примітка',
  'Додатків',
  'Папка',
  'Зберіг',
  'Коли збережено',
  'Message-ID',
  'MD5 вкладень',
] as const;

/** Службові колонки, приховані в таблиці. */
export const HIDDEN_COLUMNS: readonly string[] = ['Message-ID', 'MD5 вкладень'];

/** Ширина колонок у пікселях (у порядку COLUMNS). */
export const COLUMN_WIDTHS = [45, 120, 130, 110, 110, 200, 360, 180, 75, 300, 200, 150, 200, 200];

export interface RegistryEntry {
  /** РРРР-ММ-ДД. */
  receivedDate: string;
  type: string;
  number: string;
  /** РРРР-ММ-ДД або порожньо. */
  documentDate: string;
  from: string;
  summary: string;
  note: string;
  attachmentCount: number;
  folderUrl: string;
  folderName: string;
  savedBy: string;
  savedAt: Date;
  messageId: string;
  md5: string[];
}

/**
 * Текст для USER_ENTERED: апостроф на початку змушує Таблиці зберегти значення як текст
 * («1/09» не стане датою, «=…» з теми листа не стане формулою). У клітинці апостроф не видно.
 */
const asText = (v: string) => (v ? `'${v}` : '');

const pad = (n: number) => String(n).padStart(2, '0');
const dateTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/**
 * Рядок для values.append (valueInputOption=USER_ENTERED).
 * «Папка» спершу — адреса папки (Таблиці показують її як посилання); потім клітинка
 * замінюється на назву папки з вбудованим посиланням (setCellLink). Формулу
 * =HYPERLINK не використовуємо: роздільник аргументів залежить від локалі таблиці.
 */
export function buildRow(e: RegistryEntry): (string | number)[] {
  const values: Record<(typeof COLUMNS)[number], string | number> = {
    // Номер рахує сама таблиця — коректно навіть при одночасному збереженні кількома людьми.
    '№': '=ROW()-1',
    'Дата надходження': e.receivedDate,
    'Тип': asText(e.type),
    '№ документа': asText(e.number),
    'Дата документа': e.documentDate,
    'Від кого': asText(e.from),
    'Короткий зміст': asText(e.summary),
    'Примітка': asText(e.note),
    'Додатків': e.attachmentCount,
    'Папка': e.folderUrl,
    'Зберіг': asText(e.savedBy),
    'Коли збережено': dateTime(e.savedAt),
    'Message-ID': asText(e.messageId),
    'MD5 вкладень': asText([...e.md5].sort().join(' ')),
  };
  return COLUMNS.map((c) => values[c]);
}

export interface DuplicateMatch {
  /** Номер рядка в таблиці (1 — заголовок). */
  row: number;
  by: 'message-id' | 'md5';
  savedAt: string;
  savedBy: string;
  folderName: string;
}

/**
 * Шукає дублікат у значеннях реєстру (перший рядок — заголовки; колонки шукаються
 * за назвою, тож адміністратор може їх переставляти). Спершу збіг Message-ID,
 * потім — хоча б одного MD5 вкладень (той самий наказ, що прийшов іншим листом).
 */
export function findDuplicate(values: string[][], messageId: string, md5: string[]): DuplicateMatch | null {
  const [header, ...rows] = values;
  if (!header) return null;
  const col = (name: string) => header.indexOf(name);
  const iMsg = col('Message-ID');
  const iMd5 = col('MD5 вкладень');
  const describe = (r: string[], i: number, by: DuplicateMatch['by']): DuplicateMatch => ({
    row: i + 2,
    by,
    savedAt: r[col('Коли збережено')] ?? '',
    savedBy: r[col('Зберіг')] ?? '',
    folderName: r[col('Папка')] ?? '',
  });

  if (messageId && iMsg >= 0) {
    const i = rows.findIndex((r) => (r[iMsg] ?? '').trim() === messageId);
    if (i >= 0) return describe(rows[i], i, 'message-id');
  }
  if (md5.length && iMd5 >= 0) {
    const wanted = new Set(md5);
    const i = rows.findIndex((r) => (r[iMd5] ?? '').split(/\s+/).some((h) => h && wanted.has(h)));
    if (i >= 0) return describe(rows[i], i, 'md5');
  }
  return null;
}

/** Номер рядка з діапазону відповіді append: «'Реєстр'!A5:N5» → 5. */
export function rowFromRange(range: string): number | null {
  const m = range.match(/![A-Z]+(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Літера колонки за індексом (0 → A). */
export function columnLetter(index: number): string {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
