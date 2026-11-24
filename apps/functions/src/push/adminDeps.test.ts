import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPushDeps, ministriesOfUids } from './adminDeps';

// Doc ref falso: o Firestore real recusa caminhos com segmento vazio ou número ímpar de segmentos.
const fs = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  getAllCalls: [] as string[][],
  commits: [] as string[][],
  // vínculos em ministries/{ministryId}/members/{uid}
  members: [] as Array<{ ministryId: string; uid: string }>,
  inQueries: [] as string[][],
}));

vi.mock('firebase-admin/firestore', () => {
  const doc = (path: string) => {
    const parts = path.split('/');
    if (parts.length !== 2 || parts.some((p) => p === '')) {
      throw new Error(`Invalid document reference: ${path}`);
    }
    return { path, id: parts[1] };
  };
  const db = {
    doc,
    getAll: async (...refs: Array<{ path: string; id: string }>) => {
      fs.getAllCalls.push(refs.map((r) => r.path));
      return refs.map((r) => ({ id: r.id, data: () => fs.users.get(r.id) }));
    },
    batch: () => {
      const pending: string[] = [];
      return {
        delete: (ref: { path: string }) => pending.push(ref.path),
        commit: async () => {
          fs.commits.push([...pending]);
        },
      };
    },
    collection: () => ({ get: async () => ({ docs: [] }) }),
    collectionGroup: (name: string) => ({
      where: (field: string, op: string, values: string[]) => ({
        get: async () => {
          if (name !== 'members' || field !== 'uid' || op !== 'in') {
            throw new Error(`consulta inesperada: ${name} ${field} ${op}`);
          }
          // O Firestore recusa `in` com mais de 30 valores.
          if (values.length > 30) throw new Error('in com mais de 30 valores');
          fs.inQueries.push([...values]);
          const docs = fs.members
            .filter((m) => values.includes(m.uid))
            .map((m) => ({
              data: () => ({ uid: m.uid }),
              ref: { parent: { parent: { id: m.ministryId } } },
            }));
          return { docs };
        },
      }),
    }),
  };
  return { getFirestore: () => db };
});

const msg = vi.hoisted(() => ({ sendEach: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => msg }));

beforeEach(() => {
  fs.users.clear();
  fs.members.length = 0;
  fs.inQueries.length = 0;
  fs.getAllCalls.length = 0;
  fs.commits.length = 0;
  msg.sendEach.mockReset();
});

describe('createPushDeps.sendBatch', () => {
  it('builds the exact sendEach message for one device, with renotify next to the tag', async () => {
    msg.sendEach.mockResolvedValue({ responses: [{ success: true }] });

    await createPushDeps().sendBatch([
      {
        token: 'tok-1',
        message: {
          title: 'Novo repertório',
          body: 'Domingo',
          link: 'https://louvor-hajaluz.web.app/repertorios/r1',
          tag: 'rep-r1',
        },
      },
    ]);

    expect(msg.sendEach).toHaveBeenCalledWith([
      {
        token: 'tok-1',
        notification: { title: 'Novo repertório', body: 'Domingo' },
        webpush: {
          notification: {
            tag: 'rep-r1',
            renotify: true,
            icon: 'https://louvor-hajaluz.web.app/icons/icon-192.png',
            badge: 'https://louvor-hajaluz.web.app/icons/badge-96.png',
          },
          fcmOptions: { link: 'https://louvor-hajaluz.web.app/repertorios/r1' },
        },
      },
    ]);
  });

  it('takes icon and badge from the origin of the link (test site uses its own icons)', async () => {
    msg.sendEach.mockResolvedValue({ responses: [{ success: true }] });

    await createPushDeps().sendBatch([
      {
        token: 'tok-t',
        message: {
          title: 'Teste',
          body: 'Aviso de teste',
          link: 'https://louvor-hajaluz-teste.web.app/repertorios/s1',
          tag: 'teste-1',
        },
      },
    ]);

    const sent = msg.sendEach.mock.calls[0]?.[0] as Array<{ webpush: { notification: unknown } }>;
    expect(sent[0]?.webpush.notification).toEqual({
      tag: 'teste-1',
      renotify: true,
      icon: 'https://louvor-hajaluz-teste.web.app/icons/icon-192.png',
      badge: 'https://louvor-hajaluz-teste.web.app/icons/badge-96.png',
    });
  });

  it('maps success to ok, error code to code, and a missing code to unknown', async () => {
    msg.sendEach.mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { message: 'sem código' } },
        { success: false },
      ],
    });
    const m = { title: 't', body: 'b', link: 'https://x.web.app/', tag: 'g' };

    const results = await createPushDeps().sendBatch(
      ['a', 'b', 'c', 'd'].map((token) => ({ token, message: m })),
    );

    expect(results).toEqual([
      { ok: true },
      { ok: false, code: 'messaging/registration-token-not-registered' },
      { ok: false, code: 'unknown' },
      { ok: false, code: 'unknown' },
    ]);
  });
});

describe('ministriesOfUids', () => {
  it('never queries without uids', async () => {
    const out = await ministriesOfUids([]);

    expect(out.size).toBe(0);
    expect(fs.inQueries).toEqual([]);
  });

  it('reads 301 uids in 11 queries of at most 30 values, one entry per uid', async () => {
    const uids = Array.from({ length: 301 }, (_, i) => `u${i}`);
    for (const uid of uids) fs.members.push({ ministryId: 'hajaluz', uid });

    const out = await ministriesOfUids(uids);

    expect(fs.inQueries.map((q) => q.length)).toEqual([...Array(10).fill(30), 1]);
    expect(out.size).toBe(301);
    expect(out.get('u300')).toEqual(new Set(['hajaluz']));
  });

  it('collects every ministry of a user', async () => {
    fs.members.push({ ministryId: 'hajaluz', uid: 'm1' }, { ministryId: 'outro', uid: 'm1' });

    const out = await ministriesOfUids(['m1']);

    expect(out.get('m1')).toEqual(new Set(['hajaluz', 'outro']));
  });

  it('skips invalid uids (empty, containing "/", duplicated) before querying', async () => {
    fs.members.push({ ministryId: 'hajaluz', uid: 'm1' });

    await ministriesOfUids(['', 'a/b', 'm1', 'm1']);

    expect(fs.inQueries).toEqual([['m1']]);
  });

  it('leaves out a user without membership', async () => {
    fs.members.push({ ministryId: 'hajaluz', uid: 'm1' });

    const out = await ministriesOfUids(['m1', 'ausente']);

    expect([...out.keys()]).toEqual(['m1']);
  });
});

describe('createPushDeps.deleteDevices', () => {
  it('commits deletes in batches of at most 500', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `d${i}`);

    await createPushDeps().deleteDevices(ids);

    expect(fs.commits.map((c) => c.length)).toEqual([500, 500, 1]);
    expect(fs.commits[0]?.[0]).toBe('pushDevices/d0');
  });
});
