import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReminderDeps } from './reminderDeps';

const fs = vi.hoisted(() => ({
  collections: [] as string[],
  wheres: [] as unknown[][],
  docs: [] as Array<{
    id: string;
    data: () => Record<string, unknown>;
    ref?: { parent: { parent: { id: string } | null } };
  }>,
}));

vi.mock('firebase-admin/firestore', () => {
  const query = (name: string) => {
    fs.collections.push(name);
    const q = {
      where: (...args: unknown[]) => {
        fs.wheres.push(args);
        return q;
      },
      get: async () => ({ docs: fs.docs }),
    };
    return q;
  };
  return { getFirestore: () => ({ collection: query, collectionGroup: query }) };
});

beforeEach(() => {
  fs.collections.length = 0;
  fs.wheres.length = 0;
  fs.docs.length = 0;
});

describe('createReminderDeps.listRehearsalSetlists', () => {
  it('consulta setlists por rehearsalAt em (after, until], com id e dados', async () => {
    const from = new Date('2026-11-21T11:55:00Z');
    const to = new Date('2026-11-21T12:30:00Z');
    fs.docs.push({
      id: 's1',
      data: () => ({ label: 'Culto' }),
      ref: { parent: { parent: { id: 'hajaluz' } } },
    });
    fs.docs.push({
      id: 'raiz',
      data: () => ({ label: 'Antigo' }),
      ref: { parent: { parent: null } },
    });

    const found = await createReminderDeps().listRehearsalSetlists(from, to);

    expect(fs.collections).toEqual(['setlists']);
    expect(fs.wheres).toEqual([
      ['rehearsalAt', '>', from],
      ['rehearsalAt', '<=', to],
    ]);
    expect(found.map((s) => s.id)).toEqual(['s1']);
    expect(found[0]?.ministryId).toBe('hajaluz');
  });
});

describe('createReminderDeps.listRehearsalSetlists: outro ministério', () => {
  it('o ministryId vem do caminho do documento, nunca de hajaluz por padrão', async () => {
    fs.docs.push({
      id: 's9',
      data: () => ({ label: 'Outro' }),
      ref: { parent: { parent: { id: 'outro' } } },
    });

    const found = await createReminderDeps().listRehearsalSetlists(new Date(0), new Date());

    expect(found.map((s) => [s.id, s.ministryId])).toEqual([['s9', 'outro']]);
  });
});

describe('createReminderDeps.listRehearsalMarkers', () => {
  it('consulta avisosEnviados pelo setlistId', async () => {
    fs.docs.push({ id: 'r1_perto_1', data: () => ({ setlistId: 'r1', tipo: 'perto' }) });

    const markers = await createReminderDeps().listRehearsalMarkers('r1');

    expect(fs.collections).toEqual(['avisosEnviados']);
    expect(fs.wheres).toEqual([['setlistId', '==', 'r1']]);
    expect(markers).toEqual([{ setlistId: 'r1', tipo: 'perto' }]);
  });
});
