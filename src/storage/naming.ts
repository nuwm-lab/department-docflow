// Назва папки документа за шаблоном {date}_{type}_№{number}_{summary} (п. 4.1 ТЗ).

export interface FolderNameParts {
  /** Дата надходження, РРРР-ММ-ДД. */
  date: string;
  type: string;
  number: string;
  summary: string;
}

/** Максимальна довжина короткого змісту в назві. */
export const SUMMARY_MAX = 80;

/**
 * Прибирає символи, недопустимі в назвах файлів: / \ : * ? " < > |.
 * Скісні риски замінюються дефісом, щоб номер «123/01-05» лишився читабельним.
 */
export function sanitizeName(value: string): string {
  return value
    .replace(/[/\\]/g, '-')
    .replace(/[:*?"<>|]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
}

/** Обрізає до max символів, по можливості на межі слова. */
export function truncate(value: string, max = SUMMARY_MAX): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const result = space > max * 0.6 ? cut.slice(0, space) : cut;
  return result.replace(/[\s,.:;\-–—]+$/, '');
}

/**
 * Будує назву за шаблоном. Частина шаблону між «_», де значення порожнє
 * (наприклад, «№{number}» без номера), пропускається повністю.
 */
export function buildFolderName(parts: FolderNameParts, template: string): string {
  const values: Record<string, string> = {
    date: sanitizeName(parts.date),
    type: sanitizeName(parts.type),
    number: sanitizeName(parts.number),
    summary: truncate(sanitizeName(parts.summary)),
  };
  const segments = template.split('_').flatMap((segment) => {
    const keys = [...segment.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (keys.some((k) => !values[k])) return [];
    return [segment.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')];
  });
  return sanitizeName(segments.join('_')) || 'Документ';
}

/** Унікальна назва серед наявних: «Назва», «Назва_2», «Назва_3»… */
export function uniqueName(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Дата РРРР-ММ-ДД за місцевим часом. */
export function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
