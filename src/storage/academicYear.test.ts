import { describe, expect, it } from 'vitest';
import { academicYearFor, previousAcademicYear } from './academicYear';

describe('academicYearFor', () => {
  it('з 1 вересня — новий навчальний рік', () => {
    expect(academicYearFor(new Date(2026, 8, 1))).toBe('2026-2027');
    expect(academicYearFor(new Date(2026, 10, 10))).toBe('2026-2027');
    expect(academicYearFor(new Date(2026, 11, 31))).toBe('2026-2027');
  });

  it('до 31 серпня — попередній навчальний рік', () => {
    expect(academicYearFor(new Date(2027, 0, 1))).toBe('2026-2027');
    expect(academicYearFor(new Date(2026, 7, 31))).toBe('2025-2026');
  });
});

describe('previousAcademicYear', () => {
  it('повертає попередній рік', () => {
    expect(previousAcademicYear('2026-2027')).toBe('2025-2026');
  });

  it('null для назв не у форматі РРРР-РРРР', () => {
    expect(previousAcademicYear('Архів')).toBeNull();
    expect(previousAcademicYear('2026-2028')).toBeNull();
  });
});
