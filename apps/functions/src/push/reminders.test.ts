import { afterEach, describe, expect, it, vi } from 'vitest';
import { device, fakeDeps, FAKE_NOW, sentTokens, type FakeOptions } from './fakeDeps';
import { runRehearsalReminders, type ReminderDeps } from './reminders';

const MIN = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// FAKE_NOW = 12:00Z = 09:00 em Brasília.
const at = (ms: number) => new Date(FAKE_NOW.getTime() + ms);
const markerId = (ms: number, tipo = 'perto', setlistId = 'r1') =>
  `${setlistId}_${tipo}_${at(ms).getTime()}`;

type Doc = { id: string; data: Record<string, unknown> };
const doc = (
  id: string,
  rehearsalAt: Date | undefined,
  extra: Record<string, unknown> = {},
): Doc => ({
  id,
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

const members = { roles: { m1: 'member', a1: 'admin' } } satisfies FakeOptions;

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(
  docs: Doc[],
  fake: FakeOptions = {},
  markers: Array<[string, Record<string, unknown>]> = [],
) {
  const { deps, calls } = fakeDeps(fake);
  const store = new Map<string, Record<string, unknown>>(markers);
  const windows: Array<[Date, Date]> = [];
  const reminderDeps: ReminderDeps = {
    ...deps,
    claimMarker: async (id, data) => {
      if (store.has(id)) return 'exists';
      store.set(id, data);
      return 'created';
    },
    // Devolve todos os documentos: o filtro por janela é da consulta do Firestore (Tarefa 3).
    // Assim os testes de "sem hora" e "passado" passam por readRehearsalSetlist e pelo planner.
    listRehearsalSetlists: async (from, to) => {
      windows.push([from, to]);
      return docs;
    },
    listRehearsalMarkers: async (setlistId) =>
      [...store.values()].filter((m) => m.setlistId === setlistId),
  };
  return { reminderDeps, calls, store, windows };
}

describe('runRehearsalReminders: envio e marca', () => {
  it('ensaio em 10 min: envia o perto uma vez, para todos (inclusive quem gravou)', async () => {
    const { reminderDeps, calls, store } = setup([doc('r1', at(10 * MIN))], {
      ...members,
      devices: [device('t1', 'm1', 'producao'), device('t2', 'a1', 'producao')],
    });

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 2,
      already: 0,
      blocked: 0,
      failed: 0,
    });
    expect(sentTokens(calls)).toEqual(['t1', 't2']);
    expect(calls.flat()[0]?.message).toEqual({
      title: 'Ensaio em 10 min',
      body: 'Culto de domingo · hoje às 09h10. Toque para ver os louvores.',
      tag: 'setlist-r1-ensaio',
      link: 'https://louvor-hajaluz.web.app/repertorios/r1',
    });
    expect(store.get(markerId(10 * MIN))).toEqual({
      setlistId: 'r1',
      tipo: 'perto',
      rehearsalAt: at(10 * MIN),
      createdAt: FAKE_NOW,
      expiresAt: new Date(FAKE_NOW.getTime() + 60 * DAY_MS),
    });
  });

  it('reentrega e execução concorrente não duplicam', async () => {
    const { reminderDeps, calls } = setup([doc('r1', at(10 * MIN))], {
      ...members,
      devices: [device('t1', 'm1')],
    });

    const [a, b] = await Promise.all([
      runRehearsalReminders(reminderDeps),
      runRehearsalReminders(reminderDeps),
    ]);
    expect(sentTokens(calls)).toEqual(['t1']);
    expect(a.sent + b.sent).toBe(1);
    expect(a.already + b.already).toBe(1);
    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 1,
      blocked: 0,
      failed: 0,
    });
  });

  it('ensaio agora: usa o marcador "agora" e a mesma tag', async () => {
    const { reminderDeps, calls, store } = setup([doc('r1', at(0))], {
      ...members,
      devices: [device('t1', 'm1')],
    });

    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message).toMatchObject({
      title: 'Ensaio agora',
      body: 'Culto de domingo · começa às 09h00.',
      tag: 'setlist-r1-ensaio',
    });
    expect(store.has(markerId(0, 'agora'))).toBe(true);
  });
});

describe('runRehearsalReminders: mudança de horário', () => {
  const oldPerto = (ms: number): Array<[string, Record<string, unknown>]> => [
    [markerId(ms), { setlistId: 'r1', tipo: 'perto', rehearsalAt: at(ms) }],
  ];

  it('horário novo depois de um perto: "Ensaio mudou para 09h20"', async () => {
    const { reminderDeps, calls } = setup(
      [doc('r1', at(20 * MIN))],
      { ...members, devices: [device('t1', 'm1')] },
      oldPerto(25 * MIN),
    );

    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message.title).toBe('Ensaio mudou para 09h20');
  });

  it('voltar ao horário já avisado não reenvia', async () => {
    const { reminderDeps, calls } = setup(
      [doc('r1', at(25 * MIN))],
      { ...members, devices: [device('t1', 'm1')] },
      oldPerto(25 * MIN),
    );

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 1,
      blocked: 0,
      failed: 0,
    });
    expect(calls).toEqual([]);
  });
});

describe('runRehearsalReminders: marcas "agora" não contam como mudança', () => {
  it('um marcador "agora" de outro horário não transforma o próximo perto em mudança', async () => {
    const { reminderDeps, calls } = setup(
      [doc('r1', at(20 * MIN))],
      { ...members, devices: [device('t1', 'm1')] },
      [
        [
          markerId(25 * MIN, 'agora'),
          { setlistId: 'r1', tipo: 'agora', rehearsalAt: at(25 * MIN) },
        ],
      ],
    );

    await runRehearsalReminders(reminderDeps);
    expect(calls.flat()[0]?.message.title).toBe('Ensaio em 20 min');
  });
});

describe('runRehearsalReminders: janela, interruptor, origem e falhas', () => {
  it('consulta setlists entre agora − 5 min e agora + 30 min', async () => {
    const { reminderDeps, windows } = setup([]);
    await runRehearsalReminders(reminderDeps);
    expect(windows).toEqual([[at(-5 * MIN), at(30 * MIN)]]);
  });

  it('sem hora gravada, ou com a hora passada, não envia nem falha', async () => {
    const { reminderDeps, calls } = setup(
      [doc('semHora', undefined), doc('passado', at(-6 * MIN))],
      { ...members, devices: [device('t1', 'm1')] },
    );

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 0,
      blocked: 0,
      failed: 0,
    });
    expect(calls).toEqual([]);
  });

  it('config/push desligado: marca criada, nenhum envio', async () => {
    const { reminderDeps, calls, store } = setup([doc('r1', at(10 * MIN))], {
      ...members,
      devices: [device('t1', 'm1')],
      config: { enabled: false },
    });

    expect(await runRehearsalReminders(reminderDeps)).toEqual({
      sent: 0,
      already: 0,
      blocked: 1,
      failed: 0,
    });
    expect(calls).toEqual([]);
    expect(store.has(markerId(10 * MIN))).toBe(true);
  });

  it('só aparelhos da mesma origem; link do domínio de teste', async () => {
    const { reminderDeps, calls } = setup([doc('r1', at(10 * MIN), { origin: 'teste' })], {
      ...members,
      devices: [device('t1', 'm1', 'producao'), device('t2', 'm1', 'teste')],
    });

    await runRehearsalReminders(reminderDeps);
    expect(sentTokens(calls)).toEqual(['t2']);
    expect(calls.flat()[0]?.message.link).toBe(
      'https://louvor-hajaluz-teste.web.app/repertorios/r1',
    );
  });

  it('FCM indisponível: conta a falha, não reenvia no próximo minuto', async () => {
    const { reminderDeps } = setup([doc('r1', at(10 * MIN))], {
      ...members,
      devices: [device('t1', 'm1')],
    });
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

  it('erro ao criar a marca: loga só o código, não envia e segue com os outros', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { reminderDeps: base, calls } = setup(
      [doc('r1', at(10 * MIN)), doc('r2', at(10 * MIN))],
      { ...members, devices: [device('t1', 'm1')] },
    );
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
});
