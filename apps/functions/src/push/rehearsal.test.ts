import { afterEach, describe, expect, it } from 'vitest';
import {
  formatSaoPauloDay,
  formatSaoPauloHour,
  planRehearsalReminder,
  readRehearsalSetlist,
  type RehearsalSetlist,
} from './rehearsal';

const MIN = 60 * 1000;
// 21/11/2026 17:00 em Brasília (20:00Z).
const NOW = new Date('2026-11-21T20:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);

const setlist = (rehearsalAt: Date, extra: Partial<RehearsalSetlist> = {}): RehearsalSetlist => ({
  id: 'r1',
  label: 'Culto de domingo',
  origin: 'producao',
  rehearsalAt,
  expiresAt: undefined,
  ...extra,
});

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('formatSaoPauloHour', () => {
  it.each([
    ['2026-11-21T21:30:00Z', '18h30'],
    ['2026-11-22T22:00:00Z', '19h00'],
    ['2026-11-22T03:05:00Z', '00h05'],
  ])('%s sai como %s em Brasília', (iso, expected) => {
    expect(formatSaoPauloHour(new Date(iso))).toBe(expected);
  });

  it('não depende do fuso da máquina', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(formatSaoPauloHour(new Date('2026-11-21T21:30:00Z'))).toBe('18h30');
  });
});

describe('formatSaoPauloDay', () => {
  it('hoje quando o ensaio é no mesmo dia civil de Brasília', () => {
    expect(formatSaoPauloDay(at(30 * MIN), NOW)).toBe('hoje');
  });

  it('amanhã quando o ensaio cai depois da meia-noite de Brasília', () => {
    // agora: 22/11 02:45Z = 21/11 23:45 em Brasília; ensaio: 22/11 03:10Z = 22/11 00:10.
    expect(
      formatSaoPauloDay(new Date('2026-11-22T03:10:00Z'), new Date('2026-11-22T02:45:00Z')),
    ).toBe('amanhã');
  });
});

describe('readRehearsalSetlist', () => {
  const ts = (date: Date) => ({ toDate: () => date }); // Timestamp do Admin SDK

  it('lê horário, rótulo e origem; origem ausente vira producao', () => {
    expect(
      readRehearsalSetlist('r1', {
        label: 'Culto',
        items: [],
        date: '2026-11-22',
        rehearsalAt: ts(at(MIN)),
        origin: 'teste',
      }),
    ).toEqual({
      id: 'r1',
      label: 'Culto',
      origin: 'teste',
      rehearsalAt: at(MIN),
      expiresAt: undefined,
    });

    expect(
      readRehearsalSetlist('r2', { label: 'Culto', items: [], rehearsalAt: at(MIN) }),
    ).toMatchObject({ origin: 'producao', rehearsalAt: at(MIN) });
  });

  it('sem rehearsalAt, ou com texto no lugar do horário, devolve undefined', () => {
    expect(readRehearsalSetlist('r1', { label: 'Culto', items: [] })).toBeUndefined();
    expect(
      readRehearsalSetlist('r1', {
        label: 'Culto',
        items: [],
        rehearsalAt: '2026-11-21T20:10:00Z',
      }),
    ).toBeUndefined();
  });

  it('sem dados devolve undefined', () => {
    expect(readRehearsalSetlist('r1', undefined)).toBeUndefined();
  });
});

describe('planRehearsalReminder: faixas e bordas', () => {
  it.each([
    ['30 min exatos à frente', 30 * MIN, 'perto'],
    ['1 min à frente', 1 * MIN, 'perto'],
    ['10 min à frente (gravado tarde): sai na hora', 10 * MIN, 'perto'],
    ['30 min e 1 ms à frente', 30 * MIN + 1, null],
    ['exatamente agora', 0, 'agora'],
    ['4 min 59 s atrás', -5 * MIN + 1000, 'agora'],
    ['5 min atrás (limite exclusivo)', -5 * MIN, null],
    ['6 min atrás: sem retroativo', -6 * MIN, null],
  ])('%s', (_name, offset, expected) => {
    expect(planRehearsalReminder(NOW, setlist(at(offset)), [])?.tipo ?? null).toBe(expected);
  });
});

describe('planRehearsalReminder: textos e envio', () => {
  it('ensaio em 30 min: título, corpo, tag e link exatos', () => {
    expect(planRehearsalReminder(NOW, setlist(at(30 * MIN)), [])).toEqual({
      tipo: 'perto',
      rehearsalAtMs: at(30 * MIN).getTime(),
      input: {
        title: 'Ensaio em 30 min',
        body: 'Culto de domingo · hoje às 17h30. Toque para ver os louvores.',
        link: '/repertorios/r1',
        tag: 'setlist-r1-ensaio',
        origin: 'producao',
        respectSwitch: true,
      },
    });
  });

  it('ensaio agora: título e corpo exatos, mesma tag', () => {
    expect(planRehearsalReminder(NOW, setlist(NOW), [])).toEqual({
      tipo: 'agora',
      rehearsalAtMs: NOW.getTime(),
      input: {
        title: 'Ensaio agora',
        body: 'Culto de domingo · começa às 17h00.',
        link: '/repertorios/r1',
        tag: 'setlist-r1-ensaio',
        origin: 'producao',
        respectSwitch: true,
      },
    });
  });

  it('ensaio depois da meia-noite de Brasília: "amanhã às 00h10"', () => {
    // agora: 22/11 02:45Z = 21/11 23:45 em Brasília; ensaio: 22/11 03:10Z = 22/11 00:10 (25 min à frente).
    const now = new Date('2026-11-22T02:45:00Z');
    expect(
      planRehearsalReminder(now, setlist(new Date('2026-11-22T03:10:00Z')), [])?.input.body,
    ).toBe('Culto de domingo · amanhã às 00h10. Toque para ver os louvores.');
  });

  it('não define excludeUid: o lembrete vai para todos', () => {
    expect(planRehearsalReminder(NOW, setlist(at(MIN)), [])?.input).not.toHaveProperty(
      'excludeUid',
    );
  });

  it('a origem do repertório segue para o envio', () => {
    expect(
      planRehearsalReminder(NOW, setlist(at(MIN), { origin: 'teste' }), [])?.input.origin,
    ).toBe('teste');
  });
});

describe('planRehearsalReminder: título com os minutos que faltam', () => {
  it.each([
    ['30 min exatos', 30 * MIN, 'Ensaio em 30 min'],
    ['10 min', 10 * MIN, 'Ensaio em 10 min'],
    ['1 ms', 1, 'Ensaio em 1 min'],
    ['29 min 30 s', 29 * MIN + 30 * 1000, 'Ensaio em 30 min'],
  ])('%s: título "%s"', (_name, offset, title) => {
    expect(planRehearsalReminder(NOW, setlist(at(offset)), [])?.input.title).toBe(title);
  });
});

describe('planRehearsalReminder: mudança de horário', () => {
  it('horário diferente de um perto anterior: "Ensaio mudou para 17h20"', () => {
    const earlier = [at(25 * MIN).getTime()];
    expect(planRehearsalReminder(NOW, setlist(at(20 * MIN)), earlier)?.input.title).toBe(
      'Ensaio mudou para 17h20',
    );
  });

  it('mesmo horário do perto anterior: título comum', () => {
    const earlier = [at(20 * MIN).getTime()];
    expect(planRehearsalReminder(NOW, setlist(at(20 * MIN)), earlier)?.input.title).toBe(
      'Ensaio em 20 min',
    );
  });

  it('a mudança não altera o "agora"', () => {
    const earlier = [at(25 * MIN).getTime()];
    expect(planRehearsalReminder(NOW, setlist(NOW), earlier)?.input.title).toBe('Ensaio agora');
  });
});
