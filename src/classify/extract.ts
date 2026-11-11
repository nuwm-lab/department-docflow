// Витягування реквізитів документа з теми, тіла листа й назв вкладень.
// Чисті функції — покриті тестами.

/** Службові префікси теми: Re:, Fwd:, Fw:, а також українські варіанти поштових програм. */
const SUBJECT_PREFIX = /^\s*(?:re|fwd?|відп|пересл|вих)\s*(?:\[\d+\])?\s*[:：]\s*/i;

export function cleanSubject(subject: string): string {
  let s = subject.trim();
  while (SUBJECT_PREFIX.test(s)) s = s.replace(SUBJECT_PREFIX, '');
  return s.replace(/\s+/g, ' ').trim();
}

const LETTER = 'A-Za-zА-ЯҐЄІЇа-яґєії';
/** «№ 123-к», «№123/01-05», «№ 45», у назвах файлів — «№_45». */
const NUMBER_RE = new RegExp(`№[\\s_]*([0-9${LETTER}][0-9${LETTER}\\-/.]*)`, 'u');
/** Розширення файлу після номера в назві вкладення: «Наказ №77.pdf». */
const FILE_EXT = /\.(pdf|docx?|xlsx?|odt|ods|rtf|txt|jpe?g|png|tiff?|zip|rar|7z)$/i;

export function findNumber(texts: string[]): string | null {
  for (const t of texts) {
    const m = t.match(NUMBER_RE);
    if (!m) continue;
    const value = m[1].replace(FILE_EXT, '').replace(/[.\-/]+$/, '');
    if (/\d/.test(value)) return value;
  }
  return null;
}

const MONTHS = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];
const NUMERIC_DATE = '(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4}|\\d{2})';
const TEXT_DATE = `(\\d{1,2})\\s+(${MONTHS.join('|')})\\s+(\\d{4})`;
const DATE_AFTER_VID = new RegExp(`від\\s+(?:${NUMERIC_DATE}|${TEXT_DATE})`, 'iu');
const ANY_NUMERIC_DATE = new RegExp(`(?<!\\d)${NUMERIC_DATE}(?!\\d)`, 'u');
/** Фраза дати для вилучення з короткого змісту: «від 05.11.2026 р.», «від 5 листопада 2026 року». */
const DATE_PHRASE = new RegExp(`від\\s+(?:${NUMERIC_DATE}|${TEXT_DATE})(?:\\s*(?:року|р\\.?))?`, 'giu');

function toIso(day: number, month: number, year: number): string | null {
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateFromMatch(m: RegExpMatchArray): string | null {
  // Групи 1-3 — числова дата, 4-6 — текстова.
  if (m[1]) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  if (m[4]) return toIso(Number(m[4]), MONTHS.indexOf(m[5].toLowerCase()) + 1, Number(m[6]));
  return null;
}

/**
 * Дата документа (ISO РРРР-ММ-ДД). Спершу шукає «від <дата>» у всіх текстах,
 * потім будь-яку дату ДД.ММ.РРРР лише в темі (у тілі листа забагато інших дат).
 */
export function findDocumentDate(subject: string, others: string[]): string | null {
  for (const t of [subject, ...others]) {
    const m = t.match(DATE_AFTER_VID);
    const iso = m && dateFromMatch(m);
    if (iso) return iso;
  }
  const m = subject.match(ANY_NUMERIC_DATE);
  return m ? toIso(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/**
 * Короткий зміст: тема без префіксів, слова-типу на початку, номера й дати.
 * «Наказ № 123-к від 05.11.2026 Про організацію…» → «Про організацію…».
 */
export function buildSummary(subject: string, type: string | null): string {
  const cleaned = cleanSubject(subject);
  let s = cleaned.replace(DATE_PHRASE, ' ').replace(new RegExp(NUMBER_RE.source, 'gu'), ' ');
  if (type) {
    const escaped = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`^\\s*${escaped}(?=[\\s,.:;\\-–—]|$)`, 'iu'), ' ');
  }
  s = s.replace(/\s+/g, ' ').replace(/^[\s,.:;\-–—]+|[\s,:;\-–—]+$/g, '').trim();
  if (!s) return cleaned;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
