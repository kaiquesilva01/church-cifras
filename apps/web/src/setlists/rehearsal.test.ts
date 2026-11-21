import { describe, expect, it } from 'vitest';
import {
  describeRehearsal,
  isRehearsalDayInWindow,
  isValidHour,
  rehearsalInstant,
  rehearsalParts,
  rehearsalWindow,
} from './rehearsal';

describe('rehearsalInstant (Brasília, UTC-3)', () => {
  it('converte dia e hora de Brasília em instante UTC', () => {
    expect(rehearsalInstant('2026-11-22', '18:30').toISOString()).toBe('2026-11-22T21:30:00.000Z');
    expect(rehearsalInstant('2026-11-22', '00:00').toISOString()).toBe('2026-11-22T03:00:00.000Z');
    expect(rehearsalInstant('2026-11-22', '23:59').toISOString()).toBe('2026-11-23T02:59:00.000Z');
  });
});

describe('rehearsalParts', () => {
  it('é o inverso de rehearsalInstant', () => {
    expect(rehearsalParts(new Date('2026-11-22T21:30:00Z'))).toEqual({
      day: '2026-11-22',
      hour: '18:30',
    });
    expect(rehearsalParts(new Date('2026-11-23T02:59:00Z'))).toEqual({
      day: '2026-11-22',
      hour: '23:59',
    });
  });
});

describe('isValidHour', () => {
  it('aceita HH:MM de 00:00 a 23:59', () => {
    expect(isValidHour('18:30')).toBe(true);
    expect(isValidHour('23:59')).toBe(true);
    expect(isValidHour('24:00')).toBe(false);
    expect(isValidHour('1:30')).toBe(false);
    expect(isValidHour('')).toBe(false);
  });
});

describe('rehearsal window', () => {
  it('vai de 7 dias antes do culto até o próprio culto, inclusive', () => {
    expect(rehearsalWindow('2026-11-22')).toEqual({ first: '2026-11-15', last: '2026-11-22' });
    expect(isRehearsalDayInWindow('2026-11-15', '2026-11-22')).toBe(true);
    expect(isRehearsalDayInWindow('2026-11-22', '2026-11-22')).toBe(true);
    expect(isRehearsalDayInWindow('2026-11-14', '2026-11-22')).toBe(false);
    expect(isRehearsalDayInWindow('2026-11-23', '2026-11-22')).toBe(false);
  });
});

describe('describeRehearsal', () => {
  const now = new Date('2026-11-22T12:00:00Z'); // 09:00 em Brasília

  it('usa hoje e amanhã quando couber', () => {
    expect(describeRehearsal(rehearsalInstant('2026-11-22', '18:30'), now)).toEqual({
      text: 'Ensaio hoje às 18h30',
      past: false,
    });
    expect(describeRehearsal(rehearsalInstant('2026-11-23', '18:30'), now)).toEqual({
      text: 'Ensaio amanhã às 18h30',
      past: false,
    });
  });

  it('usa dia da semana abreviado e dd/mm para os outros dias', () => {
    // 2026-11-21 é sábado
    expect(describeRehearsal(rehearsalInstant('2026-11-21', '19:00'), now)).toEqual({
      text: 'Ensaio sáb · 21/11 às 19h00',
      past: true,
    });
  });

  it('marca como passado a partir da hora (inclusive)', () => {
    const at = rehearsalInstant('2026-11-22', '18:30');
    expect(describeRehearsal(at, new Date('2026-11-22T21:29:59Z')).past).toBe(false);
    expect(describeRehearsal(at, new Date('2026-11-22T21:30:00Z')).past).toBe(true);
  });

  it('decide "hoje" pelo dia de Brasília, não pelo UTC', () => {
    // 2026-11-23 02:30 UTC é 22/11 23:30 em Brasília
    const lateNow = new Date('2026-11-23T02:30:00Z');
    expect(describeRehearsal(rehearsalInstant('2026-11-22', '18:30'), lateNow).text).toBe(
      'Ensaio hoje às 18h30',
    );
  });
});
