// Google Sheets API: реєстр вхідних документів.
import {
  COLUMN_WIDTHS,
  COLUMNS,
  HIDDEN_COLUMNS,
  REGISTRY_SHEET_TITLE,
  columnLetter,
  rowFromRange,
} from '../../storage/registry';
import { SPREADSHEET_MIME, type DriveFile } from './drive';
import { googleFetch } from './http';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';

/** Діапазон першого аркуша (без назви аркуша — стійко до перейменування). */
const ALL = `A1:${columnLetter(25)}`;

/** Створює реєстр у папці року: заголовки, закріплений перший рядок, приховані службові колонки. */
export async function createRegistry(email: string, folderId: string, name: string): Promise<DriveFile> {
  // Створюємо через Drive API — одразу в потрібній папці (зокрема на Спільному диску).
  const created = await googleFetch(
    email,
    `${DRIVE_FILES}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: SPREADSHEET_MIME, parents: [folderId] }),
    },
  );
  const file = (await created.json()) as DriveFile;

  const meta = await googleFetch(email, `${SHEETS}/${file.id}?fields=sheets.properties(sheetId)`);
  const sheetId = ((await meta.json()) as { sheets: { properties: { sheetId: number } }[] }).sheets[0].properties
    .sheetId;

  await googleFetch(
    email,
    `${SHEETS}/${file.id}/values/${encodeURIComponent('A1')}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [COLUMNS] }),
    },
  );

  const hidden = COLUMNS.map((c, i) => (HIDDEN_COLUMNS.includes(c) ? i : -1)).filter((i) => i >= 0);
  const requests: unknown[] = [
    {
      updateSheetProperties: {
        properties: { sheetId, title: REGISTRY_SHEET_TITLE, gridProperties: { frozenRowCount: 1 } },
        fields: 'title,gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.91, green: 0.94, blue: 0.99 },
            wrapStrategy: 'WRAP',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)',
      },
    },
    {
      // Рядки даних — звичайний шрифт без фону (на випадок, якщо таблиця скопіює формат заголовка).
      repeatCell: {
        range: { sheetId, startRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: false },
            backgroundColor: { red: 1, green: 1, blue: 1 },
            verticalAlignment: 'TOP',
          },
        },
        fields: 'userEnteredFormat(textFormat.bold,backgroundColor,verticalAlignment)',
      },
    },
    ...COLUMN_WIDTHS.map((pixelSize, i) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize },
        fields: 'pixelSize',
      },
    })),
    ...hidden.map((i) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { hiddenByUser: true },
        fields: 'hiddenByUser',
      },
    })),
  ];
  await googleFetch(email, `${SHEETS}/${file.id}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  return file;
}

/** Усі значення першого аркуша, як їх бачить користувач (FORMATTED_VALUE). */
export async function readRegistry(email: string, spreadsheetId: string): Promise<string[][]> {
  const res = await googleFetch(email, `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(ALL)}`);
  return ((await res.json()) as { values?: string[][] }).values ?? [];
}

interface CellData {
  hyperlink?: string;
  formattedValue?: string;
  textFormatRuns?: { format?: { link?: { uri?: string } } }[];
}

/** Посилання з клітинки (вбудоване в текст або сама адреса). null — посилання немає. */
export async function readCellLink(email: string, spreadsheetId: string, a1: string): Promise<string | null> {
  const url = new URL(`${SHEETS}/${spreadsheetId}`);
  url.searchParams.set('ranges', a1);
  url.searchParams.set('fields', 'sheets.data.rowData.values(hyperlink,formattedValue,textFormatRuns.format.link.uri)');
  const res = await googleFetch(email, url.href);
  const data = (await res.json()) as { sheets?: { data?: { rowData?: { values?: CellData[] }[] }[] }[] };
  const cell = data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0];
  if (!cell) return null;
  return (
    cell.hyperlink ??
    cell.textFormatRuns?.find((r) => r.format?.link?.uri)?.format?.link?.uri ??
    (cell.formattedValue?.startsWith('https://') ? cell.formattedValue : null)
  );
}

async function firstSheetId(email: string, spreadsheetId: string): Promise<number> {
  const res = await googleFetch(email, `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId)`);
  return ((await res.json()) as { sheets: { properties: { sheetId: number } }[] }).sheets[0].properties.sheetId;
}

/**
 * Записує в клітинку текст із вбудованим посиланням (без формул — не залежить від локалі).
 * row — номер рядка в таблиці (з 1), column — індекс колонки (з 0).
 */
export async function setCellLink(
  email: string,
  spreadsheetId: string,
  row: number,
  column: number,
  text: string,
  uri: string,
): Promise<void> {
  const sheetId = await firstSheetId(email, spreadsheetId);
  await googleFetch(email, `${SHEETS}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: row - 1,
              endRowIndex: row,
              startColumnIndex: column,
              endColumnIndex: column + 1,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: { stringValue: text },
                    textFormatRuns: [{ startIndex: 0, format: { link: { uri } } }],
                  },
                ],
              },
            ],
            fields: 'userEnteredValue,textFormatRuns',
          },
        },
      ],
    }),
  });
}

/**
 * Додає рядок у кінець таблиці. append безпечний при одночасному збереженні кількома людьми.
 * OVERWRITE пише в наступний порожній рядок; INSERT_ROWS вставляв би новий рядок,
 * який успадковує форматування рядка вище (жирний заголовок).
 */
export async function appendRow(
  email: string,
  spreadsheetId: string,
  row: (string | number)[],
): Promise<number | null> {
  const res = await googleFetch(
    email,
    `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent('A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    },
  );
  const range = ((await res.json()) as { updates?: { updatedRange?: string } }).updates?.updatedRange ?? '';
  return rowFromRange(range);
}
