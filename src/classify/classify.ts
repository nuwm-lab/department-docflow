// Визначення типу документа за правилами з _config.json.
import { FALLBACK_TYPE, type ClassificationRule } from '../storage/config';

export interface ClassifyInput {
  subject: string;
  /** Текст тіла листа (без HTML). */
  body: string;
  fromEmail: string;
}

function matches(rule: ClassificationRule, input: ClassifyInput): boolean {
  const subject = input.subject.toLowerCase();
  const body = input.body.toLowerCase();
  const email = input.fromEmail.toLowerCase();
  const domain = email.split('@')[1] ?? '';

  if (rule.subjectContains?.some((w) => subject.includes(w))) return true;
  if (rule.bodyContains?.some((w) => body.includes(w))) return true;
  if (rule.fromAddresses?.some((a) => a === email)) return true;
  if (rule.fromDomains?.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
  return false;
}

/** Перше правило, що спрацювало (порядок як у _config.json); інакше «Інше». */
export function classify(input: ClassifyInput, rules: ClassificationRule[], types: string[]): string {
  for (const rule of rules) {
    if (types.includes(rule.type) && matches(rule, input)) return rule.type;
  }
  return FALLBACK_TYPE;
}
