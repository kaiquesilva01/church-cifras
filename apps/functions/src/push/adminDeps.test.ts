import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPushDeps } from './adminDeps';

// Doc ref falso: o Firestore real recusa caminhos com segmento vazio ou número ímpar de segmentos.
const fs = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  getAllCalls: [] as string[][],
  commits: [] as string[][],
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
  };
  return { getFirestore: () => db };
});

const msg = vi.hoisted(() => ({ sendEach: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => msg }));

beforeEach(() => {
  fs.users.clear();
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

describe('createPushDeps.getUserRoles', () => {
  it('never calls getAll without uids', async () => {
    const roles = await createPushDeps().getUserRoles([]);

    expect(roles.size).toBe(0);
    expect(fs.getAllCalls).toEqual([]);
  });

  it('reads 301 uids in two getAll blocks of 300 and 1', async () => {
    const uids = Array.from({ length: 301 }, (_, i) => `u${i}`);
    for (const uid of uids) fs.users.set(uid, { role: 'member' });

    const roles = await createPushDeps().getUserRoles(uids);

    expect(fs.getAllCalls.map((c) => c.length)).toEqual([300, 1]);
    expect(roles.size).toBe(301);
  });

  it('skips invalid uids (empty or containing "/") instead of failing the whole read', async () => {
    fs.users.set('m1', { role: 'admin' });

    const roles = await createPushDeps().getUserRoles(['', 'a/b', 'm1']);

    expect(fs.getAllCalls).toEqual([['users/m1']]);
    expect([...roles]).toEqual([['m1', 'admin']]);
  });

  it('returns no role for a user without a valid role field', async () => {
    fs.users.set('v1', { role: 'superuser' });

    const roles = await createPushDeps().getUserRoles(['v1', 'ausente']);

    expect(roles.size).toBe(0);
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
