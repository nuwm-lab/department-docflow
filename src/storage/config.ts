// Спільні налаштування кафедри: файл _config.json у кореневій папці «Вхідна документація».
// Розбір і перевірка — без звернень до Google (чисті функції, покриті тестами).

export const CONFIG_FILE_NAME = '_config.json';

/** Правило автоматичного визначення типу документа. */
export interface ClassificationRule {
  type: string;
  /** Ключові слова в темі (без урахування регістру). */
  subjectContains?: string[];
  /** Ключові слова в тілі листа. */
  bodyContains?: string[];
  /** Домени відправника: «mon.gov.ua» спрацює й для «osvita.mon.gov.ua». */
  fromDomains?: string[];
  /** Точні адреси відправника. */
  fromAddresses?: string[];
}

export interface DocflowConfig {
  /** Назва папки поточного навчального року; null — визначати за датою. */
  currentYearFolder: string | null;
  documentTypes: string[];
  rules: ClassificationRule[];
  folderNameTemplate: string;
  bodyFormat: 'markdown';
  alsoSavePdf: boolean;
  /** Шукати дублікати й у реєстрі попереднього року (листи кінця серпня). */
  checkPreviousYear: boolean;
}

export const FALLBACK_TYPE = 'Інше';

export const DEFAULT_CONFIG: DocflowConfig = {
  currentYearFolder: null,
  documentTypes: ['Наказ', 'Розпорядження', 'Вхідний лист', 'Службова записка', 'Протокол', FALLBACK_TYPE],
  rules: [
    { type: 'Наказ', subjectContains: ['наказ'] },
    { type: 'Розпорядження', subjectContains: ['розпорядження'] },
  ],
  folderNameTemplate: '{date}_{type}_№{number}_{summary}',
  bodyFormat: 'markdown',
  alsoSavePdf: false,
  checkPreviousYear: true,
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface ParsedConfig {
  config: DocflowConfig;
  /** Некритичні зауваження (невідомі поля тощо) — показуються на сторінці налаштувань. */
  warnings: string[];
}

const KNOWN_KEYS = new Set<string>([...Object.keys(DEFAULT_CONFIG)]);
const RULE_LIST_KEYS = ['subjectContains', 'bodyContains', 'fromDomains', 'fromAddresses'] as const;
const TEMPLATE_PLACEHOLDERS = ['{date}', '{type}', '{number}', '{summary}'];

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

const clean = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];

/**
 * Розбирає текст _config.json. Відсутні поля беруться зі значень за замовчуванням.
 * Кидає ConfigError з поясненням українською, якщо файл пошкоджено.
 */
export function parseConfig(text: string): ParsedConfig {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    throw new ConfigError(`Файл ${CONFIG_FILE_NAME} пошкоджено — це не коректний JSON (${(err as Error).message}).`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`Файл ${CONFIG_FILE_NAME} має містити об’єкт { … }.`);
  }
  const obj = raw as Record<string, unknown>;
  const config: DocflowConfig = structuredClone(DEFAULT_CONFIG);

  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`Невідоме поле «${key}» — його пропущено.`);
  }

  if ('currentYearFolder' in obj) {
    const v = obj.currentYearFolder;
    if (v === null || v === '') config.currentYearFolder = null;
    else if (typeof v === 'string') config.currentYearFolder = v.trim();
    else throw new ConfigError('Поле «currentYearFolder» має бути рядком, наприклад "2026-2027".');
  }

  if ('documentTypes' in obj) {
    if (!isStringArray(obj.documentTypes) || clean(obj.documentTypes).length === 0) {
      throw new ConfigError('Поле «documentTypes» має бути непорожнім списком рядків.');
    }
    config.documentTypes = clean(obj.documentTypes);
  }
  if (!config.documentTypes.includes(FALLBACK_TYPE)) config.documentTypes.push(FALLBACK_TYPE);

  if ('rules' in obj) {
    if (!Array.isArray(obj.rules)) throw new ConfigError('Поле «rules» має бути списком правил.');
    config.rules = obj.rules.map((r, i) => parseRule(r, i + 1, config.documentTypes, warnings));
  } else {
    config.rules = config.rules.filter((r) => config.documentTypes.includes(r.type));
  }

  if ('folderNameTemplate' in obj) {
    const v = obj.folderNameTemplate;
    if (typeof v !== 'string' || !v.trim()) {
      throw new ConfigError('Поле «folderNameTemplate» має бути непорожнім рядком.');
    }
    if (!TEMPLATE_PLACEHOLDERS.some((p) => v.includes(p))) {
      throw new ConfigError(
        `Шаблон «folderNameTemplate» не містить жодного з полів ${TEMPLATE_PLACEHOLDERS.join(', ')}.`,
      );
    }
    config.folderNameTemplate = v.trim();
  }

  if ('bodyFormat' in obj && obj.bodyFormat !== 'markdown') {
    warnings.push('Підтримується лише bodyFormat "markdown" — використано його.');
  }

  for (const key of ['alsoSavePdf', 'checkPreviousYear'] as const) {
    if (key in obj) {
      if (typeof obj[key] !== 'boolean') throw new ConfigError(`Поле «${key}» має бути true або false.`);
      config[key] = obj[key];
    }
  }

  return { config, warnings };
}

function parseRule(r: unknown, n: number, types: string[], warnings: string[]): ClassificationRule {
  if (typeof r !== 'object' || r === null || Array.isArray(r)) {
    throw new ConfigError(`Правило №${n} у «rules» має бути об’єктом { "type": …, … }.`);
  }
  const obj = r as Record<string, unknown>;
  if (typeof obj.type !== 'string' || !obj.type.trim()) {
    throw new ConfigError(`Правило №${n} у «rules» не має поля «type».`);
  }
  const rule: ClassificationRule = { type: obj.type.trim() };
  if (!types.includes(rule.type)) {
    warnings.push(`Правило №${n}: тип «${rule.type}» відсутній у documentTypes.`);
  }

  let hasCondition = false;
  for (const key of RULE_LIST_KEYS) {
    if (!(key in obj)) continue;
    const v = obj[key];
    const list = typeof v === 'string' ? [v] : v;
    if (!isStringArray(list)) {
      throw new ConfigError(`Правило №${n}: поле «${key}» має бути списком рядків.`);
    }
    const values = clean(list).map((s) => s.toLowerCase());
    if (values.length) {
      rule[key] = values;
      hasCondition = true;
    }
  }
  if (!hasCondition) warnings.push(`Правило №${n} (${rule.type}) не має жодної умови — воно не спрацює.`);
  return rule;
}
