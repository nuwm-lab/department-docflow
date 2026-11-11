import { describe, expect, it } from 'vitest';
import { findForwardedSender } from './forwarded';

describe('findForwardedSender', () => {
  it('Gmail англійською (text/plain)', () => {
    const text = [
      'Переслала наказ.',
      '',
      '---------- Forwarded message ---------',
      'From: Деканат ННІ <Dekanat@nuwm.edu.ua>',
      'Date: Mon, 10 Nov 2026 at 12:00',
      'Subject: Наказ № 123-к',
      'To: <kafedra@nuwm.edu.ua>',
      '',
      'Текст наказу',
    ].join('\n');
    expect(findForwardedSender(text, 'Fwd: Наказ № 123-к')).toEqual({ name: 'Деканат ННІ', email: 'dekanat@nuwm.edu.ua' });
  });

  it('Gmail українською', () => {
    const text = '---------- Пересланий лист ---------\nВід: МОН України <info@mon.gov.ua>\nДата: 10 лист. 2026';
    expect(findForwardedSender(text, 'Fwd: Щодо акредитації')).toEqual({ name: 'МОН України', email: 'info@mon.gov.ua' });
  });

  it('розмітка з HTML: пробіли навколо адреси, ім’я в лапках', () => {
    const text = '---------- Forwarded message ---------\nFrom:  "Деканат, ННІ"   < dekanat@nuwm.edu.ua >\nDate: …';
    expect(findForwardedSender(text, 'Fwd: x')).toEqual({ name: 'Деканат, ННІ', email: 'dekanat@nuwm.edu.ua' });
  });

  it('Outlook: -----Original Message----- і mailto', () => {
    const text = '-----Original Message-----\nFrom: Деканат [mailto:dekanat@nuwm.edu.ua]\nSent: Monday';
    expect(findForwardedSender(text, 'FW: Наказ')).toEqual({ name: 'Деканат', email: 'dekanat@nuwm.edu.ua' });
  });

  it('Outlook без роздільника — лише для теми FW:', () => {
    const text = 'Див. нижче\n\nFrom: Ректорат <rector@nuwm.edu.ua>\nSent: Monday, 10 November 2026\nTo: …';
    expect(findForwardedSender(text, 'FW: Розпорядження')?.email).toBe('rector@nuwm.edu.ua');
    expect(findForwardedSender(text, 'RE: Розпорядження')).toBeNull();
  });

  it('пересилання пересланого — найглибший відправник', () => {
    const text = [
      '---------- Forwarded message ---------',
      'From: Секретар <sec@nuwm.edu.ua>',
      '',
      '---------- Forwarded message ---------',
      'From: МОН <info@mon.gov.ua>',
    ].join('\n');
    expect(findForwardedSender(text, 'Fwd: Fwd: Лист')?.email).toBe('info@mon.gov.ua');
  });

  it('лише ім’я без адреси', () => {
    const text = '-----Original Message-----\nFrom: Деканат ННІ\nSent: Monday';
    expect(findForwardedSender(text, 'FW: x')).toEqual({ name: 'Деканат ННІ', email: '' });
  });

  it('звичайний лист і відповідь з цитатою — не переслані', () => {
    expect(findForwardedSender('Добрий день!\nНадсилаю наказ.', 'Наказ № 5')).toBeNull();
    expect(findForwardedSender('Дякую!\n\nOn Mon, 10 Nov 2026 Деканат <d@x.ua> wrote:\n> текст', 'Re: Наказ')).toBeNull();
  });
});
