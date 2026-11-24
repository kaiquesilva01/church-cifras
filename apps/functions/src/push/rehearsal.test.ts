import { afterEach, describe, expect, it } from 'vitest';
import {
  buildRehearsalReminder,
  dueRehearsalNotice,
  formatSaoPauloDay,
  formatSaoPauloHour,
  lastRehearsalAt,
  readRehearsalSetlist,
  saoPauloMinuteOfDay,
} from './rehearsal';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Horário de Brasília (UTC-3 fixo) como Date. Aceita hh:mm e hh:mm:ss.
const br = (day: string, t: string) => new Date(`${day}T${t.length === 5 ? `${t}:00` : t}-03:00`);
// 21/11/2026 17:00 em Brasília (20:00Z).
const NOW = new Date('2026-11-21T20:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);

it('guarda do helper br: interpreta hh:mm e hh:mm:ss em Brasília', () => {
  expect(br('2026-11-21', '08:09:59').getTime()).not.toBeNaN();
  expect(br('2026-11-21', '17:00')).toEqual(NOW);
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
      readRehearsalSetlist('r1', 'hajaluz', {
        label: 'Culto',
        items: [],
        date: '2026-11-22',
        rehearsalAt: ts(at(MIN)),
        origin: 'teste',
      }),
    ).toEqual({
      id: 'r1',
      ministryId: 'hajaluz',
      label: 'Culto',
      origin: 'teste',
      rehearsalAt: at(MIN),
      expiresAt: undefined,
    });

    expect(
      readRehearsalSetlist('r2', 'hajaluz', { label: 'Culto', items: [], rehearsalAt: at(MIN) }),
    ).toMatchObject({ origin: 'producao', rehearsalAt: at(MIN) });
  });

  it('sem rehearsalAt, ou com texto no lugar do horário, devolve undefined', () => {
    expect(readRehearsalSetlist('r1', 'hajaluz', { label: 'Culto', items: [] })).toBeUndefined();
    expect(
      readRehearsalSetlist('r1', 'hajaluz', {
        label: 'Culto',
        items: [],
        rehearsalAt: '2026-11-21T20:10:00Z',
      }),
    ).toBeUndefined();
  });

  it('sem dados devolve undefined', () => {
    expect(readRehearsalSetlist('r1', 'hajaluz', undefined)).toBeUndefined();
  });
});

describe('dueRehearsalNotice: véspera', () => {
  const now = br('2026-11-20', '18:30');
  const at = br('2026-11-21', '18:30');

  it('ensaio 24 h depois: véspera', () => {
    expect(dueRehearsalNotice(now, at)).toBe('vespera');
  });

  it('dentro dos 10 min finais da janela: véspera', () => {
    expect(dueRehearsalNotice(now, new Date(now.getTime() + DAY - (9 * MIN + 59_000)))).toBe(
      'vespera',
    );
  });

  it('10 min antes de 24 h exatas já não sai', () => {
    expect(dueRehearsalNotice(now, new Date(now.getTime() + DAY - 10 * MIN))).toBeNull();
  });

  it('depois de 24 h não sai', () => {
    expect(dueRehearsalNotice(now, new Date(now.getTime() + DAY + 1))).toBeNull();
  });
});

describe('dueRehearsalNotice: 1 hora antes (retroativo)', () => {
  it.each([
    ['1 ms à frente', 1, 'perto'],
    ['1 hora exata', HOUR, 'perto'],
    ['1 hora e 1 ms', HOUR + 1, null],
    ['agora', 0, null],
    ['1 min atrás', -MIN, null],
    ['20 min à frente (gravado tarde)', 20 * MIN, 'perto'],
  ])('%s', (_name, offset, expected) => {
    expect(dueRehearsalNotice(NOW, new Date(NOW.getTime() + offset))).toBe(expected);
  });
});

describe('dueRehearsalNotice: no dia (8h00 a 8h10, ensaio às 11h00 ou depois)', () => {
  const at = br('2026-11-21', '18:30');

  it.each([
    ['08:00', '2026-11-21T08:00', 'dia'],
    ['08:09:59', '2026-11-21T08:09:59', 'dia'],
    ['08:10:00 já não sai', '2026-11-21T08:10:00', null],
    ['07:59:59 ainda não', '2026-11-21T07:59:59', null],
  ])('agora %s', (_name, _iso, expected) => {
    const now = br('2026-11-21', _iso.slice(11));
    expect(dueRehearsalNotice(now, at)).toBe(expected);
  });

  it('ensaio às 10h59 não recebe "no dia"', () => {
    expect(dueRehearsalNotice(br('2026-11-21', '08:00'), br('2026-11-21', '10:59'))).toBeNull();
  });

  it('ensaio às 11h00 recebe "no dia"', () => {
    expect(dueRehearsalNotice(br('2026-11-21', '08:00'), br('2026-11-21', '11:00'))).toBe('dia');
  });

  it('ensaio às 7h de sábado: véspera às 7h de sexta, 1 hora às 6h, sem "no dia"', () => {
    const at7 = br('2026-11-21', '07:00');
    expect(dueRehearsalNotice(br('2026-11-20', '07:00'), at7)).toBe('vespera');
    expect(dueRehearsalNotice(br('2026-11-21', '06:00'), at7)).toBe('perto');
    expect(dueRehearsalNotice(br('2026-11-21', '08:05'), at7)).toBeNull();
  });
});

describe('dueRehearsalNotice: meia-noite UTC', () => {
  it('usa o dia de Brasília (sáb 23h40 de Brasília, UTC já em domingo)', () => {
    const now = new Date('2026-11-22T02:40:00Z');
    expect(dueRehearsalNotice(now, new Date('2026-11-22T03:10:00Z'))).toBe('perto');
    expect(dueRehearsalNotice(now, new Date(now.getTime() + DAY - 5 * MIN))).toBe('vespera');
  });
});

describe('saoPauloMinuteOfDay', () => {
  it('minutos desde 00h00 de Brasília', () => {
    expect(saoPauloMinuteOfDay(br('2026-11-21', '08:09:59'))).toBe(489);
    expect(saoPauloMinuteOfDay(br('2026-11-21', '00:00'))).toBe(0);
    expect(saoPauloMinuteOfDay(new Date('2026-11-21T03:00:00Z'))).toBe(0);
  });
});

describe('lastRehearsalAt', () => {
  const ts = (date: Date) => ({ toDate: () => date }); // Timestamp do Admin SDK
  const now = br('2026-11-20', '12:00');

  it('sem marcas devolve undefined', () => {
    expect(lastRehearsalAt([], now)).toBeUndefined();
  });

  it('devolve o rehearsalAt da marca de maior createdAt, qualquer que seja a ordem', () => {
    const markers = [
      {
        tipo: 'perto',
        createdAt: br('2026-11-19', '10:00'),
        rehearsalAt: br('2026-11-21', '19:00'),
      },
      {
        tipo: 'vespera',
        createdAt: br('2026-11-20', '08:00'),
        rehearsalAt: br('2026-11-22', '18:30'),
      },
      { tipo: 'dia', createdAt: br('2026-11-19', '18:00'), rehearsalAt: br('2026-11-21', '18:30') },
    ];
    expect(lastRehearsalAt(markers, now)).toEqual(br('2026-11-22', '18:30'));
    expect(lastRehearsalAt([...markers].reverse(), now)).toEqual(br('2026-11-22', '18:30'));
  });

  it('ignora marcas agora e de tipo novo, mesmo mais recentes', () => {
    const markers = [
      {
        tipo: 'agora',
        createdAt: br('2026-11-20', '11:00'),
        rehearsalAt: br('2026-11-21', '17:00'),
      },
      {
        tipo: 'novo',
        createdAt: br('2026-11-20', '11:30'),
        rehearsalAt: br('2026-11-21', '18:00'),
      },
    ];
    expect(lastRehearsalAt(markers, now)).toBeUndefined();
  });

  it('ignora marca sem createdAt ou sem rehearsalAt', () => {
    const markers = [
      {
        tipo: 'vespera',
        createdAt: br('2026-11-19', '10:00'),
        rehearsalAt: br('2026-11-21', '18:30'),
      },
      { tipo: 'dia', rehearsalAt: br('2026-11-22', '18:30') },
      { tipo: 'perto', createdAt: br('2026-11-20', '11:00') },
    ];
    expect(lastRehearsalAt(markers, now)).toEqual(br('2026-11-21', '18:30'));
  });

  it('aceita Timestamp do Admin SDK nos dois campos (a marca Timestamp vence)', () => {
    const markers = [
      {
        tipo: 'vespera',
        createdAt: br('2026-11-19', '10:00'),
        rehearsalAt: br('2026-11-21', '18:30'),
      },
      {
        tipo: 'perto',
        createdAt: ts(br('2026-11-20', '10:00')),
        rehearsalAt: ts(br('2026-11-22', '18:30')),
      },
    ];
    expect(lastRehearsalAt(markers, now)).toEqual(br('2026-11-22', '18:30'));
  });

  it('aceita Timestamp só no rehearsalAt (a marca Timestamp vence)', () => {
    const markers = [
      {
        tipo: 'vespera',
        createdAt: br('2026-11-19', '10:00'),
        rehearsalAt: br('2026-11-21', '18:30'),
      },
      {
        tipo: 'perto',
        createdAt: br('2026-11-20', '10:00'),
        rehearsalAt: ts(br('2026-11-22', '18:30')),
      },
    ];
    expect(lastRehearsalAt(markers, now)).toEqual(br('2026-11-22', '18:30'));
  });

  it('marca de ensaio já passado não conta como mudança', () => {
    const markers = [
      {
        tipo: 'vespera',
        createdAt: br('2026-11-13', '18:30'),
        rehearsalAt: br('2026-11-14', '18:30'),
      },
    ];
    expect(lastRehearsalAt(markers, br('2026-11-21', '19:00'))).toBeUndefined();
  });

  it('marca passada com createdAt mais novo não vence a futura', () => {
    const markers = [
      {
        tipo: 'perto',
        createdAt: br('2026-11-20', '10:00'),
        rehearsalAt: br('2026-11-20', '11:00'),
      },
      {
        tipo: 'vespera',
        createdAt: br('2026-11-19', '10:00'),
        rehearsalAt: br('2026-11-22', '18:30'),
      },
    ];
    expect(lastRehearsalAt(markers, now)).toEqual(br('2026-11-22', '18:30'));
  });
});

describe('buildRehearsalReminder: textos exatos', () => {
  const rehearsalAt = br('2026-11-21', '18:30');
  const base = {
    id: 'r1',
    ministryId: 'hajaluz',
    label: 'Culto de domingo',
    origin: 'producao' as const,
    expiresAt: undefined,
  };
  const common = {
    ministryId: 'hajaluz',
    link: '/repertorios/r1',
    tag: 'setlist-r1-ensaio',
    origin: 'producao',
    respectSwitch: true,
  };
  const body = 'Culto de domingo · sáb 21/11. Toque para ver os louvores.';

  it('véspera', () => {
    expect(
      buildRehearsalReminder(
        br('2026-11-20', '18:30'),
        { ...base, rehearsalAt },
        'vespera',
        undefined,
      ),
    ).toEqual({ ...common, title: 'Ensaio amanhã às 18h30', body });
  });

  it('no dia', () => {
    expect(
      buildRehearsalReminder(br('2026-11-21', '08:00'), { ...base, rehearsalAt }, 'dia', undefined),
    ).toEqual({ ...common, title: 'Ensaio hoje às 18h30', body });
  });

  it.each([
    { name: '60 min', offset: 60 * MIN, title: 'Ensaio em 1 hora' },
    { name: '59 min 30 s', offset: 59 * MIN + 30_000, title: 'Ensaio em 1 hora' },
    { name: '58 min 30 s', offset: 58 * MIN + 30_000, title: 'Ensaio em 1 hora' },
    { name: '58 min', offset: 58 * MIN, title: 'Ensaio em 58 min' },
    { name: '20 min', offset: 20 * MIN, title: 'Ensaio em 20 min' },
    { name: '1 ms', offset: 1, title: 'Ensaio em 1 min' },
  ])('1 hora com ensaio em $name: "$title"', ({ offset, title }) => {
    const at = new Date(NOW.getTime() + offset);
    expect(
      buildRehearsalReminder(NOW, { ...base, rehearsalAt: at }, 'perto', undefined).title,
    ).toBe(title);
  });

  it('1 hora de 20 min: corpo com "hoje às 17h20"', () => {
    const at = new Date(NOW.getTime() + 20 * MIN);
    expect(buildRehearsalReminder(NOW, { ...base, rehearsalAt: at }, 'perto', undefined).body).toBe(
      'Culto de domingo · hoje às 17h20. Toque para ver os louvores.',
    );
  });

  it('mudou no mesmo dia: "Ensaio mudou para 19h00"', () => {
    expect(
      buildRehearsalReminder(
        br('2026-11-21', '18:00'),
        { ...base, rehearsalAt: br('2026-11-21', '19:00') },
        'perto',
        br('2026-11-21', '18:30'),
      ),
    ).toEqual({ ...common, title: 'Ensaio mudou para 19h00', body });
  });

  it('mudou de dia: "Ensaio mudou para dom 22/11 às 19h00"', () => {
    expect(
      buildRehearsalReminder(
        br('2026-11-21', '19:00'),
        { ...base, rehearsalAt: br('2026-11-22', '19:00') },
        'vespera',
        br('2026-11-21', '18:30'),
      ),
    ).toEqual({
      ...common,
      title: 'Ensaio mudou para dom 22/11 às 19h00',
      body: 'Culto de domingo · dom 22/11. Toque para ver os louvores.',
    });
  });

  it('previous igual ao horário do ensaio: título normal', () => {
    expect(
      buildRehearsalReminder(
        br('2026-11-20', '18:30'),
        { ...base, rehearsalAt },
        'vespera',
        br('2026-11-21', '18:30'),
      ).title,
    ).toBe('Ensaio amanhã às 18h30');
  });

  it('origem teste segue para origin', () => {
    expect(
      buildRehearsalReminder(
        br('2026-11-20', '18:30'),
        { ...base, origin: 'teste', rehearsalAt },
        'vespera',
        undefined,
      ).origin,
    ).toBe('teste');
  });

  it('véspera de ensaio às 21h de domingo (= 00h UTC de segunda): dia de Brasília', () => {
    // Domingo 21h de Brasília é segunda 00h UTC; o dia do aviso segue sendo domingo.
    const sunday = br('2026-11-22', '21:00');
    expect(
      buildRehearsalReminder(
        br('2026-11-21', '21:00'),
        { ...base, rehearsalAt: sunday },
        'vespera',
        undefined,
      ),
    ).toEqual({
      ...common,
      title: 'Ensaio amanhã às 21h00',
      body: 'Culto de domingo · dom 22/11. Toque para ver os louvores.',
    });
  });

  it('mudou entre 18h30 e 21h30 de domingo (cruza a meia-noite UTC): mesmo dia de Brasília', () => {
    expect(
      buildRehearsalReminder(
        br('2026-11-22', '20:45'),
        { ...base, rehearsalAt: br('2026-11-22', '21:30') },
        'perto',
        br('2026-11-22', '18:30'),
      ),
    ).toEqual({
      ...common,
      title: 'Ensaio mudou para 21h30',
      body: 'Culto de domingo · dom 22/11. Toque para ver os louvores.',
    });
  });
});
