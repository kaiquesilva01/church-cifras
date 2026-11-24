import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceNewSetlist, markerExpiresAt, type AnnounceDeps } from './announce';
import { device, fakeDeps, FAKE_NOW, sentTokens, type FakeOptions } from './fakeDeps';

const DAY_MS = 24 * 60 * 60 * 1000;
const plus = (days: number) => new Date(FAKE_NOW.getTime() + days * DAY_MS);

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i}`, songId: `s${i}`, key: 'C' }));
// Criado depois do corte (22/11/2026 00:00 de Brasília) por padrão.
const CREATED_AFTER = new Date('2026-11-22T12:00:00Z');
const CREATED_BEFORE = new Date(Date.UTC(2026, 10, 22, 3, 0, 0) - 1);
const setlist = (n: number, extra: Record<string, unknown> = {}) => ({
  date: '2026-11-22',
  label: 'Culto de domingo',
  items: items(n),
  createdBy: 'a1',
  updatedBy: 'a1',
  createdAt: CREATED_AFTER,
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(fake: FakeOptions = {}, existing: string[] = []) {
  const { deps, calls } = fakeDeps(fake);
  const markers = new Map<string, Record<string, unknown>>(existing.map((id) => [id, {}]));
  const claims: string[] = [];
  const annDeps: AnnounceDeps = {
    ...deps,
    claimMarker: async (id, data) => {
      claims.push(id);
      if (markers.has(id)) return 'exists';
      markers.set(id, data);
      return 'created';
    },
  };
  return { annDeps, calls, markers, claims };
}

const members = { ministries: { m1: ['hajaluz'], a1: ['hajaluz'] } } satisfies FakeOptions;

describe('announceNewSetlist: ministério', () => {
  it('envia o aviso de repertório novo só ao ministério do repertório', async () => {
    const { annDeps, calls } = setup({
      devices: [device('t-a', 'ana'), device('t-b', 'bia')],
      ministries: { ana: ['hajaluz'], bia: ['outro'] },
    });

    await announceNewSetlist(annDeps, 's1', 'hajaluz', undefined, setlist(4));

    expect(sentTokens(calls)).toEqual(['t-a']);
  });

  it('repertório de outro ministério: só membros dele recebem; hajaluz não recebe nada', async () => {
    const { annDeps, calls } = setup({
      devices: [device('t-hajaluz', 'ana'), device('t-outro', 'bia')],
      ministries: { ana: ['hajaluz'], bia: ['outro'] },
    });

    await announceNewSetlist(annDeps, 's9', 'outro', undefined, setlist(4));

    expect(sentTokens(calls)).toEqual(['t-outro']);
  });
});

describe('announceNewSetlist: envio e marca', () => {
  it('cria a marca com os campos exatos e avisa quem não gravou', async () => {
    const { annDeps, calls, markers } = setup({
      ...members,
      devices: [device('t1', 'm1', 'producao'), device('t2', 'a1', 'producao')],
    });

    // createdBy a1 fica de fora (a1 não recebe); updatedBy m1 não é excluído na criação.
    const result = await announceNewSetlist(
      annDeps,
      'r1',
      'hajaluz',
      undefined,
      setlist(4, { updatedBy: 'm1' }),
    );

    expect(result).toBe('sent');
    expect(markers.get('r1_novo')).toEqual({
      setlistId: 'r1',
      tipo: 'novo',
      createdAt: FAKE_NOW,
      expiresAt: new Date(FAKE_NOW.getTime() + 60 * DAY_MS),
    });
    expect(sentTokens(calls)).toEqual(['t1']);
    expect(calls.flat()[0]?.message).toEqual({
      title: 'Novo repertório',
      body: 'Culto de domingo · dom 22/11',
      tag: 'setlist-r1-novo',
      link: 'https://louvor-hajaluz.web.app/repertorios/r1',
    });
  });

  it('marca de envio anterior: 3 → 4 não envia de novo', async () => {
    const { annDeps, calls } = setup({ ...members, devices: [device('t1', 'm1')] }, ['r1_novo']);

    expect(await announceNewSetlist(annDeps, 'r1', 'hajaluz', setlist(3), setlist(4))).toBe(
      'already-announced',
    );
    expect(calls).toEqual([]);
  });

  it('reentrega do mesmo evento não duplica', async () => {
    const { annDeps, calls } = setup({ ...members, devices: [device('t1', 'm1')] });

    expect(await announceNewSetlist(annDeps, 'r1', 'hajaluz', setlist(3), setlist(4))).toBe('sent');
    expect(await announceNewSetlist(annDeps, 'r1', 'hajaluz', setlist(3), setlist(4))).toBe(
      'already-announced',
    );
    expect(sentTokens(calls)).toEqual(['t1']);
  });

  it('sequência 3 → 4 → 3 → 4: avisa uma vez só, mesmo caindo abaixo de 4', async () => {
    const { annDeps, calls, markers } = setup({ ...members, devices: [device('t1', 'm1')] });

    expect(await announceNewSetlist(annDeps, 'r1', 'hajaluz', setlist(3), setlist(4))).toBe('sent');
    expect(await announceNewSetlist(annDeps, 'r1', 'hajaluz', setlist(4), setlist(3))).toBe(
      'not-due',
    );
    expect(await announceNewSetlist(annDeps, 'r1', 'hajaluz', setlist(3), setlist(4))).toBe(
      'already-announced',
    );
    expect(sentTokens(calls)).toEqual(['t1']);
    expect(markers.has('r1_novo')).toBe(true);
  });

  it('atualização que chega a 4 exclui updatedBy (não createdBy)', async () => {
    const { annDeps, calls } = setup({
      ...members,
      devices: [device('t1', 'm1', 'producao'), device('t2', 'a1', 'producao')],
    });

    expect(
      await announceNewSetlist(
        annDeps,
        'r1',
        'hajaluz',
        setlist(3),
        setlist(4, { updatedBy: 'm1' }),
      ),
    ).toBe('sent');
    expect(sentTokens(calls)).toEqual(['t2']);
  });

  it('marca não vence antes de um repertório com data futura', async () => {
    const { annDeps, markers } = setup({ ...members, devices: [] });

    await announceNewSetlist(
      annDeps,
      'r1',
      'hajaluz',
      undefined,
      setlist(4, { expiresAt: plus(200) }),
    );

    expect(markers.get('r1_novo')?.expiresAt).toEqual(plus(200));
  });

  it('interruptor desligado: bloqueado, sem envio; a marca fica', async () => {
    const { annDeps, calls, markers } = setup({
      ...members,
      config: { enabled: false },
      devices: [device('t1', 'm1')],
    });

    expect(await announceNewSetlist(annDeps, 'r1', 'hajaluz', setlist(3), setlist(4))).toBe(
      'blocked',
    );
    expect(calls).toEqual([]);
    expect(markers.has('r1_novo')).toBe(true);
  });

  it('origem teste só avisa aparelhos de teste', async () => {
    const { annDeps, calls } = setup({
      ...members,
      devices: [device('t1', 'm1', 'producao'), device('t2', 'm1', 'teste')],
    });

    expect(
      await announceNewSetlist(
        annDeps,
        'r1',
        'hajaluz',
        setlist(3),
        setlist(4, { origin: 'teste' }),
      ),
    ).toBe('sent');
    expect(sentTokens(calls)).toEqual(['t2']);
  });

  it('falha de envio só loga, não relança e não tira a marca', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { annDeps, markers } = setup({ ...members, devices: [device('t1', 'm1')] });
    annDeps.sendBatch = async () => {
      throw Object.assign(new Error('fcm fora'), { code: 'unavailable' });
    };

    expect(await announceNewSetlist(annDeps, 'r1', 'hajaluz', setlist(3), setlist(4))).toBe(
      'failed',
    );
    expect(markers.has('r1_novo')).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith('push: falha ao avisar repertório novo', {
      setlistId: 'r1',
      code: 'unavailable',
    });
  });

  it('código de erro que não é texto nem número é logado como "error", nunca como objeto', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { annDeps } = setup({ ...members, devices: [device('t1', 'm1')] });
    annDeps.sendBatch = async () => {
      throw Object.assign(new Error('fcm fora'), { code: { detalhe: 'token-xyz' } });
    };

    expect(await announceNewSetlist(annDeps, 'r1', 'hajaluz', setlist(3), setlist(4))).toBe(
      'failed',
    );
    expect(errorSpy).toHaveBeenCalledWith('push: falha ao avisar repertório novo', {
      setlistId: 'r1',
      code: 'error',
    });
  });

  it('erro ao criar a marca (que não seja já existente) propaga e não envia', async () => {
    const { annDeps, calls } = setup({ ...members, devices: [device('t1', 'm1')] });
    annDeps.claimMarker = async () => {
      throw Object.assign(new Error('unavailable'), { code: 14 });
    };

    await expect(
      announceNewSetlist(annDeps, 'r1', 'hajaluz', setlist(3), setlist(4)),
    ).rejects.toThrow('unavailable');
    expect(calls).toEqual([]);
  });

  it('data inválida: "invalid", sem marca e sem envio', async () => {
    const { annDeps, claims, calls } = setup({ ...members, devices: [device('t1', 'm1')] });

    expect(
      await announceNewSetlist(
        annDeps,
        'r1',
        'hajaluz',
        setlist(3),
        setlist(4, { date: '2026-02-31' }),
      ),
    ).toBe('invalid');
    expect(claims).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('markerExpiresAt: a marca não vence antes do repertório', () => {
  it.each([
    ['repertório sem expiresAt: agora + 60 dias', undefined, plus(60)],
    ['repertório vence antes de 60 dias: agora + 60 dias', plus(10), plus(60)],
    ['repertório vence depois de 60 dias: a marca vence junto', plus(200), plus(200)],
  ])('%s', (_name, setlistExpiresAt, expected) => {
    expect(markerExpiresAt(FAKE_NOW, setlistExpiresAt)).toEqual(expected);
  });
});

describe('announceNewSetlist: quando não avisa', () => {
  it.each([
    ['0 → 3', setlist(0), setlist(3)],
    ['criação com 3', undefined, setlist(3)],
    ['4 → 5', setlist(4), setlist(5)],
    ['5 → 4', setlist(5), setlist(4)],
    ['edição de rótulo com 4', setlist(4), setlist(4, { label: 'Outro' })],
    ['exclusão', setlist(4), undefined],
    [
      '3 → 4 em repertório criado antes do corte (legado)',
      setlist(3),
      setlist(4, { createdAt: CREATED_BEFORE }),
    ],
    ['criação com 4 criada antes do corte', undefined, setlist(4, { createdAt: CREATED_BEFORE })],
    ['3 → 4 sem createdAt legível', setlist(3), setlist(4, { createdAt: undefined })],
    ['criação com 4 sem createdAt legível', undefined, setlist(4, { createdAt: 'ontem' })],
  ])('%s: "not-due", sem marca e sem envio', async (_name, before, after) => {
    const { annDeps, claims, calls } = setup({ ...members, devices: [device('t1', 'm1')] });

    expect(await announceNewSetlist(annDeps, 'r1', 'hajaluz', before, after)).toBe('not-due');
    expect(claims).toEqual([]);
    expect(calls).toEqual([]);
  });
});
