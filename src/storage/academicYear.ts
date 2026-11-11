// Навчальний рік за датою: починається 1 вересня.
// 10.11.2026 → «2026-2027», 31.08.2026 → «2025-2026».

/** Місяць початку навчального року (0 = січень, 8 = вересень). */
const YEAR_START_MONTH = 8;

export function academicYearFor(date: Date): string {
  const y = date.getFullYear();
  const start = date.getMonth() >= YEAR_START_MONTH ? y : y - 1;
  return `${start}-${start + 1}`;
}

/** Попередній навчальний рік: «2026-2027» → «2025-2026». null, якщо назва не в цьому форматі. */
export function previousAcademicYear(name: string): string | null {
  const m = name.match(/^(\d{4})-(\d{4})$/);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) return null;
  const start = Number(m[1]) - 1;
  return `${start}-${start + 1}`;
}
