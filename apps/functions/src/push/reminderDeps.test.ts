import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReminderDeps } from './reminderDeps';

const fs = vi.hoisted(() => ({
  collections: [] as string[],
  wheres: [] as unknown[][],
  docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
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
  return { getFirestore: () => ({ collection: query }) };
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
    fs.docs.push({ id: 'r1', data: () => ({ label: 'Culto' }) });

    const found = await createReminderDeps().listRehearsalSetlists(from, to);

    expect(fs.collections).toEqual(['setlists']);
    expect(fs.wheres).toEqual([
      ['rehearsalAt', '>', from],
      ['rehearsalAt', '<=', to],
    ]);
    expect(found).toEqual([{ id: 'r1', data: { label: 'Culto' } }]);
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
