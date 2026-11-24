import { afterEach, describe, expect, it, vi } from 'vitest';
import { device, fakeDeps, sentTokens, type FakeOptions } from './fakeDeps';
import { runRehearsalReminders, type ReminderDeps } from './reminders';
import { deviceId } from './token';

// Horário de Brasília (UTC−3 fixo), independente do fuso da máquina.
const br = (day: string, t: string) => new Date(`${day}T${t.length === 5 ? `${t}:00` : t}-03:00`);
expect(br('2026-11-21', '08:09:59').getTime()).not.toBeNaN();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type Doc = { id: string; ministryId: string; data: Record<string, unknown> };
const doc = (
  id: string,
  rehearsalAt: Date | undefined,
  extra: Record<string, unknown> = {},
): Doc => ({
  id,
  ministryId: 'hajaluz',
  data: {
    date: '2026-11-22',
    label: 'Culto de domingo',
    items: [],
    createdBy: 'a1',
    updatedBy: 'a1',
    ...(rehearsalAt ? { rehearsalAt } : {}),
    ...extra,
  },
});

const members = { ministries: { m1: ['hajaluz'], a1: ['hajaluz'] } } satisfies FakeOptions;

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(
  docs: Doc[],
  fake: FakeOptions = {},
  markers: Array<[string, Record<string, unknown>]> = [],
) {
  const { deps, calls, clock } = fakeDeps(fake);
  const store = new Map<string, Record<string, unknown>>(markers);
  const reads = { setlists: [] as Array<[Date, Date]>, markers: [] as string[] };
  const reminderDeps: ReminderDeps = {
    ...deps,
    claimMarker: async (id, data) => {
      if (store.has(id)) return 'exists';
      store.set(id, data);
      return 'created';
    },
    // Filtra por (after, until] como a consulta do Firestore.
    listRehearsalSetlists: async (after, until) => {
      reads.setlists.push([after, until]);
      return docs.filter((d) => {
        const at = d.data.rehearsalAt;
        return at instanceof Date && at > after && at <= until;
      });
    },
    listRehearsalMarkers: async (setlistId) => {
      reads.markers.push(setlistId);
      return [...store.values()].filter((m) => m.setlistId === setlistId);
    },
  };
  return { reminderDeps, calls, store, clock, reads };
}

describe('runRehearsalReminders: janela e leituras', () => {
  it('consulta (agora, agora + 24 h] e não lê marcas sem aviso devido', async () => {
    const now = br('2026-11-21', '12:00');
    const { reminderDeps, clock, reads } = setup([doc('r1', br('2026-11-22', '18:30'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = now;

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 0,
      blocked: 0,
      failed: 0,
    });
    expect(reads.setlists).toEqual([[now, new Date(now.getTime() + DAY)]]);
    expect(reads.markers).toEqual([]);
  });
});

describe('runRehearsalReminders: véspera', () => {
  it('véspera: sexta 18h30 avisa "Ensaio amanhã às 18h30", uma vez', async () => {
    const { reminderDeps, calls, store, clock } = setup([doc('r1', br('2026-11-21', '18:30'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-20', '18:30');

    expect(await runRehearsalReminders(reminderDeps)).toMatchObject({ sent: 1 });
    expect(calls.flat()[0]?.message).toEqual({
      title: 'Ensaio amanhã às 18h30',
      body: 'Culto de domingo · sáb 21/11. Toque para ver os louvores.',
      tag: 'setlist-r1-ensaio',
      link: 'https://louvor-hajaluz.web.app/repertorios/r1',
    });
    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 1,
      blocked: 0,
      failed: 0,
    });
    expect(store.get(`r1_vespera_${br('2026-11-21', '18:30').getTime()}`)).toMatchObject({
      setlistId: 'r1',
      tipo: 'vespera',
    });
  });

  it('véspera: fora da janela não sai', async () => {
    const { reminderDeps, calls, clock } = setup([doc('r1', br('2026-11-21', '18:30'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-20', '18:29:59');
    await runRehearsalReminders(reminderDeps);
    clock.now = br('2026-11-20', '18:40:00');
    await runRehearsalReminders(reminderDeps);
    expect(calls).toEqual([]);
  });

  it('repertório gravado depois da véspera não recebe véspera', async () => {
    const { reminderDeps, calls, clock, reads } = setup([doc('r1', br('2026-11-21', '18:30'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-20', '18:45');

    expect(await runRehearsalReminders(reminderDeps)).toMatchObject({ sent: 0 });
    expect(calls).toEqual([]);
    expect(reads.markers).toEqual([]);
  });

  it('ensaio às 7h: véspera às 7h do dia anterior e 1 hora às 6h, sem no dia', async () => {
    const ensaio = br('2026-11-21', '07:00');
    const { reminderDeps, calls, clock } = setup([doc('r1', ensaio)], {
      ...members,
      devices: [device('t1', 'm1')],
    });

    clock.now = br('2026-11-20', '07:00');
    await runRehearsalReminders(reminderDeps);
    clock.now = br('2026-11-21', '06:00');
    await runRehearsalReminders(reminderDeps);
    clock.now = br('2026-11-21', '08:05');
    await runRehearsalReminders(reminderDeps);

    expect(calls.flat().map((m) => m.message.title)).toEqual([
      'Ensaio amanhã às 07h00',
      'Ensaio em 1 hora',
    ]);
  });
});

describe('runRehearsalReminders: no dia', () => {
  it('no dia: ensaio às 18h30, às 08h00 sai "Ensaio hoje às 18h30"; às 08h10 não sai', async () => {
    const { reminderDeps, calls, clock } = setup([doc('r1', br('2026-11-21', '18:30'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });

    clock.now = br('2026-11-21', '08:00');
    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message.title).toBe('Ensaio hoje às 18h30');

    clock.now = br('2026-11-21', '08:10');
    await runRehearsalReminders(reminderDeps);
    expect(calls).toHaveLength(1);
  });

  it('no dia: ensaio às 10h59 não recebe; às 11h00 recebe', async () => {
    const docs = [doc('r1', br('2026-11-21', '10:59'))];
    const { reminderDeps, calls, clock } = setup(docs, {
      ...members,
      devices: [device('t1', 'm1')],
    });

    clock.now = br('2026-11-21', '08:05');
    await runRehearsalReminders(reminderDeps);
    expect(calls).toEqual([]);

    docs[0] = doc('r1', br('2026-11-21', '11:00'));
    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message.title).toBe('Ensaio hoje às 11h00');
  });

  it('no dia: repertório gravado às 08h20 não recebe', async () => {
    const { reminderDeps, calls, clock } = setup([doc('r1', br('2026-11-21', '18:30'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-21', '08:20');

    expect(await runRehearsalReminders(reminderDeps)).toMatchObject({ sent: 0 });
    expect(calls).toEqual([]);
  });
});

describe('runRehearsalReminders: 1 hora', () => {
  it('1 hora: gravado 20 min antes sai na hora, com "Ensaio em 20 min"', async () => {
    const { reminderDeps, calls, clock } = setup([doc('r1', br('2026-11-21', '17:20'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-21', '17:00');

    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message).toMatchObject({
      title: 'Ensaio em 20 min',
      body: 'Culto de domingo · hoje às 17h20. Toque para ver os louvores.',
    });
  });

  it('1 hora: um único aviso para 60, 30 e 5 min antes (sem aviso de 30 min)', async () => {
    const { reminderDeps, calls, clock } = setup([doc('r1', br('2026-11-21', '18:00'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    let sent = 0;
    for (const t of ['17:00', '17:01', '17:30', '17:55']) {
      clock.now = br('2026-11-21', t);
      sent += (await runRehearsalReminders(reminderDeps)).sent;
    }

    expect(calls.flat().map((m) => m.message.title)).toEqual(['Ensaio em 1 hora']);
    expect(sent).toBe(1);
  });

  it('1 hora: 61 min antes não sai; ensaio passado não sai', async () => {
    const docs = [doc('r1', br('2026-11-21', '18:01'))];
    const { reminderDeps, calls, clock } = setup(docs, {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-21', '17:00');
    expect(await runRehearsalReminders(reminderDeps)).toMatchObject({ sent: 0 });

    docs[0] = doc('r1', br('2026-11-21', '16:59'));
    expect(await runRehearsalReminders(reminderDeps)).toMatchObject({ sent: 0 });
    expect(calls).toEqual([]);
  });

  it('cron atrasado: parado 15 min, ensaio a 40 min ainda sai o 1 hora', async () => {
    const { reminderDeps, calls, clock } = setup([doc('r1', br('2026-11-21', '18:05'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-21', '17:25');

    expect(await runRehearsalReminders(reminderDeps)).toMatchObject({ sent: 1 });
    expect(calls.flat()[0]?.message.title).toBe('Ensaio em 40 min');
  });

  it('marca perto antiga do mesmo horário impede novo 1 hora (deploy)', async () => {
    const ensaio = br('2026-11-21', '17:20');
    const { reminderDeps, calls, clock } = setup(
      [doc('r1', ensaio)],
      { ...members, devices: [device('t1', 'm1')] },
      [
        [
          `r1_perto_${ensaio.getTime()}`,
          {
            setlistId: 'r1',
            tipo: 'perto',
            rehearsalAt: ensaio,
            createdAt: br('2026-11-21', '16:00'),
          },
        ],
      ],
    );
    clock.now = br('2026-11-21', '17:00');

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 1,
      blocked: 0,
      failed: 0,
    });
    expect(calls).toEqual([]);
  });

  it('marcas "agora" e "novo" não contam como mudança', async () => {
    const ensaio = br('2026-11-21', '17:20');
    const { reminderDeps, calls, clock } = setup(
      [doc('r1', ensaio)],
      { ...members, devices: [device('t1', 'm1')] },
      [
        [
          'r1_agora_1',
          {
            setlistId: 'r1',
            tipo: 'agora',
            rehearsalAt: br('2026-11-21', '19:00'),
            createdAt: br('2026-11-21', '16:55'),
          },
        ],
        ['r1_novo', { setlistId: 'r1', createdAt: br('2026-11-21', '16:56') }],
      ],
    );
    clock.now = br('2026-11-21', '17:00');

    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message.title).toBe('Ensaio em 20 min');
  });
});

describe('runRehearsalReminders: mudança de horário', () => {
  it('mudou no mesmo dia: "Ensaio mudou para 19h00"; o aviso seguinte volta ao normal', async () => {
    const { reminderDeps, calls, clock } = setup(
      [doc('r1', br('2026-11-22', '19:00'))],
      { ...members, devices: [device('t1', 'm1')] },
      [
        [
          `r1_vespera_${br('2026-11-22', '18:30').getTime()}`,
          {
            setlistId: 'r1',
            tipo: 'vespera',
            rehearsalAt: br('2026-11-22', '18:30'),
            createdAt: br('2026-11-21', '18:30'),
          },
        ],
      ],
    );

    clock.now = br('2026-11-21', '19:00');
    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message.title).toBe('Ensaio mudou para 19h00');

    clock.now = br('2026-11-22', '08:00');
    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[1]?.message.title).toBe('Ensaio hoje às 19h00');
  });

  it('mudou em outro dia: "Ensaio mudou para sáb 21/11 às 20h00"', async () => {
    const { reminderDeps, calls, clock } = setup(
      [doc('r1', br('2026-11-21', '20:00'))],
      { ...members, devices: [device('t1', 'm1')] },
      [
        [
          `r1_vespera_${br('2026-11-20', '23:30').getTime()}`,
          {
            setlistId: 'r1',
            tipo: 'vespera',
            rehearsalAt: br('2026-11-20', '23:30'),
            createdAt: br('2026-11-19', '23:30'),
          },
        ],
      ],
    );
    clock.now = br('2026-11-20', '20:00');

    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message).toMatchObject({
      title: 'Ensaio mudou para sáb 21/11 às 20h00',
      body: 'Culto de domingo · sáb 21/11. Toque para ver os louvores.',
    });
  });

  it('A→B→A: volta ao horário já enviado não reenvia; tipo ainda não enviado para A sai', async () => {
    const docs = [doc('r1', br('2026-11-22', '18:30'))];
    const { reminderDeps, calls, clock } = setup(docs, {
      ...members,
      devices: [device('t1', 'm1')],
    });

    clock.now = br('2026-11-21', '18:30');
    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message.title).toBe('Ensaio amanhã às 18h30');

    docs[0] = doc('r1', br('2026-11-22', '19:00'));
    clock.now = br('2026-11-21', '19:00');
    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[1]?.message.title).toBe('Ensaio mudou para 19h00');

    docs[0] = doc('r1', br('2026-11-22', '18:30'));
    clock.now = br('2026-11-21', '18:31');
    expect(await runRehearsalReminders(reminderDeps)).toMatchObject({ already: 1, sent: 0 });

    clock.now = br('2026-11-22', '17:30');
    expect(await runRehearsalReminders(reminderDeps)).toMatchObject({ sent: 1 });
    expect(calls.flat()[2]?.message.title).toBe('Ensaio mudou para 18h30');
  });

  it('repertórios diferentes na mesma execução não interferem', async () => {
    const { reminderDeps, calls, clock } = setup(
      [doc('r1', br('2026-11-21', '17:30')), doc('r2', br('2026-11-21', '18:10'))],
      { ...members, devices: [device('t1', 'm1')] },
      [
        [
          `r2_perto_${br('2026-11-21', '18:05').getTime()}`,
          {
            setlistId: 'r2',
            tipo: 'perto',
            rehearsalAt: br('2026-11-21', '18:05'),
            createdAt: br('2026-11-21', '16:00'),
          },
        ],
      ],
    );
    clock.now = br('2026-11-21', '17:10');

    await runRehearsalReminders(reminderDeps);
    const messages = calls.flat().map((m) => m.message);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ title: 'Ensaio em 20 min', tag: 'setlist-r1-ensaio' });
    expect(messages[1]).toMatchObject({
      title: 'Ensaio mudou para 18h10',
      tag: 'setlist-r2-ensaio',
    });
  });

  it('repertório reaproveitado: marca de ensaio passado não gera "mudou"', async () => {
    const { reminderDeps, calls, clock } = setup(
      [doc('r1', br('2026-11-22', '19:00'))],
      { ...members, devices: [device('t1', 'm1')] },
      [
        [
          `r1_vespera_${br('2026-11-14', '18:30').getTime()}`,
          {
            setlistId: 'r1',
            tipo: 'vespera',
            rehearsalAt: br('2026-11-14', '18:30'),
            createdAt: br('2026-11-13', '18:30'),
          },
        ],
      ],
    );
    clock.now = br('2026-11-21', '19:00');

    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message.title).toBe('Ensaio amanhã às 19h00');
  });

  it('perto da meia-noite UTC: a véspera usa o dia de Brasília', async () => {
    const { reminderDeps, calls, clock } = setup([doc('r1', new Date('2026-11-23T02:35:00Z'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = new Date('2026-11-22T02:40:00Z');

    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message).toMatchObject({
      title: 'Ensaio amanhã às 23h35',
      body: 'Culto de domingo · dom 22/11. Toque para ver os louvores.',
    });
  });
});

describe('runRehearsalReminders: interruptor, origem e falhas', () => {
  it('lembrete vai só ao ministério do ensaio; aparelho de outro ministério não recebe', async () => {
    const { reminderDeps, calls, clock } = setup([doc('r1', br('2026-11-21', '17:20'))], {
      devices: [device('t-a', 'ana'), device('t-b', 'bia')],
      ministries: { ana: ['hajaluz'], bia: ['outro'] },
    });
    clock.now = br('2026-11-21', '17:00');

    await runRehearsalReminders(reminderDeps);

    expect(sentTokens(calls)).toEqual(['t-a']);
  });

  it('lembrete de repertório de outro ministério: só o outro recebe, hajaluz não', async () => {
    const outro: Doc = { ...doc('r9', br('2026-11-21', '17:20')), ministryId: 'outro' };
    const { reminderDeps, calls, clock } = setup([outro], {
      devices: [device('t-hajaluz', 'ana'), device('t-outro', 'bia')],
      ministries: { ana: ['hajaluz'], bia: ['outro'] },
    });
    clock.now = br('2026-11-21', '17:00');

    await runRehearsalReminders(reminderDeps);

    expect(sentTokens(calls)).toEqual(['t-outro']);
  });

  it('viewer: aviso de 1 hora vai só ao membro, e o aparelho do viewer é removido', async () => {
    const { reminderDeps, calls, clock } = setup([doc('r1', br('2026-11-21', '17:20'))], {
      ministries: { m1: ['hajaluz'] },
      devices: [device('t1', 'm1'), device('t-viewer', 'v1')],
    });
    const deleteDevices = vi.spyOn(reminderDeps, 'deleteDevices');
    clock.now = br('2026-11-21', '17:00');

    await runRehearsalReminders(reminderDeps);
    expect(sentTokens(calls)).toEqual(['t1']);
    expect(deleteDevices).toHaveBeenCalledWith([deviceId('t-viewer')]);
  });

  it('config/push desligado: marca criada, nenhum envio', async () => {
    const { reminderDeps, calls, store, clock } = setup([doc('r1', br('2026-11-21', '18:30'))], {
      ...members,
      devices: [device('t1', 'm1')],
      config: { enabled: false },
    });
    clock.now = br('2026-11-20', '18:30');

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 0,
      blocked: 1,
      failed: 0,
    });
    expect(calls).toEqual([]);
    expect(store.has(`r1_vespera_${br('2026-11-21', '18:30').getTime()}`)).toBe(true);
  });

  it('só aparelhos da mesma origem; link do domínio de teste', async () => {
    const { reminderDeps, calls, clock } = setup(
      [doc('r1', br('2026-11-21', '18:00'), { origin: 'teste' })],
      {
        ...members,
        devices: [device('t1', 'm1', 'producao'), device('t2', 'm1', 'teste')],
      },
    );
    clock.now = br('2026-11-21', '17:50');

    await runRehearsalReminders(reminderDeps);
    expect(sentTokens(calls)).toEqual(['t2']);
    expect(calls.flat()[0]?.message.link).toBe(
      'https://louvor-hajaluz-teste.web.app/repertorios/r1',
    );
  });

  it('FCM indisponível: conta a falha e não reenvia no minuto seguinte', async () => {
    const { reminderDeps, clock } = setup([doc('r1', br('2026-11-21', '18:00'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-21', '17:50');
    const broken: ReminderDeps = {
      ...reminderDeps,
      sendBatch: async () => {
        throw Object.assign(new Error('token t1 indisponível'), {
          code: 'messaging/internal-error',
        });
      },
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await runRehearsalReminders(broken)).toEqual({
      sent: 0,
      already: 0,
      blocked: 0,
      failed: 1,
    });
    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 1,
      blocked: 0,
      failed: 0,
    });
  });

  it('falha ao ler marcas: nenhuma marca, nenhum envio; o minuto seguinte envia', async () => {
    const {
      reminderDeps: base,
      calls,
      store,
      clock,
    } = setup([doc('r1', br('2026-11-21', '18:00'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-21', '17:50');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let failing = true;
    const reminderDeps: ReminderDeps = {
      ...base,
      listRehearsalMarkers: async (setlistId) => {
        if (failing) throw Object.assign(new Error('indisponível'), { code: 'unavailable' });
        return base.listRehearsalMarkers(setlistId);
      },
    };

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 0,
      blocked: 0,
      failed: 1,
    });
    expect(store.size).toBe(0);

    failing = false;
    expect(await runRehearsalReminders(reminderDeps)).toMatchObject({ sent: 1 });
    expect(calls.flat()).toHaveLength(1);
  });

  it('erro ao criar a marca: loga só o código e segue com os outros', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {
      reminderDeps: base,
      calls,
      clock,
    } = setup([doc('r1', br('2026-11-21', '17:20')), doc('r2', br('2026-11-21', '17:20'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-21', '17:00');
    const reminderDeps: ReminderDeps = {
      ...base,
      claimMarker: async (id, data) => {
        if (id.startsWith('r1_')) {
          throw Object.assign(new Error('segredo do token t1'), { code: 'unavailable' });
        }
        return base.claimMarker(id, data);
      },
    };

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 1,
      already: 0,
      blocked: 0,
      failed: 1,
    });
    expect(err).toHaveBeenCalledWith('push: falha no lembrete do ensaio', {
      setlistId: 'r1',
      code: 'unavailable',
    });
    expect(JSON.stringify(err.mock.calls)).not.toContain('segredo');
    expect(sentTokens(calls)).toEqual(['t1']);
  });

  it('sem hora gravada, ou com a hora passada, não envia nem falha', async () => {
    const { reminderDeps, calls, clock } = setup(
      [doc('semHora', undefined), doc('passado', br('2026-11-21', '16:55'))],
      { ...members, devices: [device('t1', 'm1')] },
    );
    clock.now = br('2026-11-21', '17:00');

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 0,
      blocked: 0,
      failed: 0,
    });
    expect(calls).toEqual([]);
  });

  it('runner ignora o que a consulta não deixaria passar (hora em texto, hora passada)', async () => {
    const { reminderDeps, calls, store, clock } = setup([], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-21', '17:00');
    // Sem o filtro da consulta: o próprio runner precisa recusar os dois.
    reminderDeps.listRehearsalSetlists = async () => [
      {
        id: 'texto',
        ministryId: 'hajaluz',
        data: {
          date: '2026-11-21',
          label: 'Culto',
          items: [],
          rehearsalAt: '2026-11-21T18:00:00-03:00',
        },
      },
      {
        id: 'passado',
        ministryId: 'hajaluz',
        data: {
          date: '2026-11-21',
          label: 'Culto',
          items: [],
          rehearsalAt: br('2026-11-21', '16:55'),
        },
      },
    ];

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 0,
      blocked: 0,
      failed: 0,
    });
    expect(calls).toEqual([]);
    expect(store.size).toBe(0);
  });
});

describe('runRehearsalReminders: log', () => {
  it('sem nada a fazer, não loga (o job roda a cada minuto)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { reminderDeps, clock } = setup([]);
    clock.now = br('2026-11-21', '17:00');

    await runRehearsalReminders(reminderDeps);
    expect(info).not.toHaveBeenCalled();
  });

  it('só "already", não loga', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { reminderDeps, clock } = setup([doc('r1', br('2026-11-21', '18:00'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-21', '17:50');

    await runRehearsalReminders(reminderDeps);
    info.mockClear();
    expect(await runRehearsalReminders(reminderDeps)).toMatchObject({ already: 1 });
    expect(info).not.toHaveBeenCalled();
  });

  it('com envio, loga só as contagens', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { reminderDeps, clock } = setup([doc('r1', br('2026-11-21', '18:00'))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
    clock.now = br('2026-11-21', '17:50');

    await runRehearsalReminders(reminderDeps);
    expect(info).toHaveBeenCalledWith('push: lembretes do ensaio', {
      sent: 1,
      already: 0,
      blocked: 0,
      failed: 0,
    });
  });
});
