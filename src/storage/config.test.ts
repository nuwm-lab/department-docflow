import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, FALLBACK_TYPE, parseConfig } from './config';

describe('parseConfig', () => {
  it('приклад із ТЗ розбирається без зауважень', () => {
    const text = JSON.stringify({
      currentYearFolder: '2026-2027',
      documentTypes: ['Наказ', 'Розпорядження', 'Вхідний лист', 'Службова записка', 'Протокол', 'Інше'],
      rules: [
        { type: 'Наказ', subjectContains: ['наказ'] },
        { type: 'Розпорядження', subjectContains: ['розпорядження'] },
        { type: 'Вхідний лист', fromDomains: ['mon.gov.ua'] },
      ],
      folderNameTemplate: '{date}_{type}_№{number}_{summary}',
      bodyFormat: 'markdown',
      alsoSavePdf: false,
    });
    const { config, warnings } = parseConfig(text);
    expect(warnings).toEqual([]);
    expect(config.currentYearFolder).toBe('2026-2027');
    expect(config.rules).toHaveLength(3);
    expect(config.rules[2]).toEqual({ type: 'Вхідний лист', fromDomains: ['mon.gov.ua'] });
  });

  it('порожній об’єкт — значення за замовчуванням', () => {
    const { config } = parseConfig('{}');
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('прибирає BOM на початку файлу', () => {
    expect(parseConfig('﻿{"currentYearFolder":"2025-2026"}').config.currentYearFolder).toBe('2025-2026');
  });

  it('порожній currentYearFolder — визначати за датою', () => {
    expect(parseConfig('{"currentYearFolder":""}').config.currentYearFolder).toBeNull();
  });

  it('завжди додає тип «Інше»', () => {
    const { config } = parseConfig('{"documentTypes":["Наказ"]}');
    expect(config.documentTypes).toEqual(['Наказ', FALLBACK_TYPE]);
  });

  it('ключові слова правил — у нижньому регістрі, рядок замість списку допускається', () => {
    const { config } = parseConfig('{"rules":[{"type":"Наказ","subjectContains":"НАКАЗ"}]}');
    expect(config.rules[0].subjectContains).toEqual(['наказ']);
  });

  it('невідомі поля й правила без умов — зауваження, не помилка', () => {
    const { warnings } = parseConfig('{"foo":1,"rules":[{"type":"Наказ"}]}');
    expect(warnings).toHaveLength(2);
  });

  it('пошкоджений JSON — ConfigError з поясненням', () => {
    expect(() => parseConfig('{"currentYearFolder": "2026-2027",}')).toThrow(ConfigError);
    expect(() => parseConfig('{"currentYearFolder": ')).toThrow(/пошкоджено/);
  });

  it('неправильні типи полів — ConfigError', () => {
    expect(() => parseConfig('[]')).toThrow(ConfigError);
    expect(() => parseConfig('{"currentYearFolder":2026}')).toThrow(/currentYearFolder/);
    expect(() => parseConfig('{"documentTypes":[]}')).toThrow(/documentTypes/);
    expect(() => parseConfig('{"rules":[{"subjectContains":["x"]}]}')).toThrow(/type/);
    expect(() => parseConfig('{"alsoSavePdf":"так"}')).toThrow(/alsoSavePdf/);
    expect(() => parseConfig('{"folderNameTemplate":"без полів"}')).toThrow(/folderNameTemplate/);
  });
});
