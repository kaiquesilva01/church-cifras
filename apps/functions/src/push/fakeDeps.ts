import { deviceId } from './token';
import type { DeviceRecord, PushDeps, PushMessage, SendResult } from './types';

export type FakeOptions = {
  /** uid -> ministryIds. Quem não está aqui não tem ministério. */
  ministries?: Record<string, string[]>;
  devices?: DeviceRecord[];
  config?: { enabled?: unknown } | null;
  /** token -> código de erro que o envio devolve para ele */
  failures?: Record<string, string>;
};

export type SentCall = Array<{ token: string; message: PushMessage }>;

export const FAKE_NOW = new Date('2026-11-21T12:00:00Z');

/** Aparelho pronto para `devices`, com o id derivado do token. */
export const device = (token: string, uid: string, origin?: string): DeviceRecord => ({
  id: deviceId(token),
  uid,
  token,
  origin,
});

/** Tokens na ordem em que foram enviados, somando todas as chamadas. */
export const sentTokens = (calls: SentCall[]) => calls.flat().map((m) => m.token);

export function fakeDeps(opts: FakeOptions = {}) {
  const devices = new Map<string, Record<string, unknown>>(
    (opts.devices ?? []).map((d) => [d.id, { uid: d.uid, token: d.token, origin: d.origin }]),
  );
  const ministries = new Map<string, string[]>(Object.entries(opts.ministries ?? {}));
  const clock = { now: FAKE_NOW };
  const calls: SentCall[] = [];

  const deps: PushDeps = {
    // A guarda de ministério não lê users/: só o vínculo conta.
    readUser: async () => null,
    listMembershipsOfUser: async (uid) =>
      (ministries.get(uid) ?? []).map((ministryId) => ({ ministryId, role: 'member' as const })),
    getDeviceOwner: async (id) => {
      const owner = devices.get(id)?.uid;
      return typeof owner === 'string' ? owner : null;
    },
    writeDevice: async (id, data) => {
      devices.set(id, { ...devices.get(id), ...data });
    },
    deleteDevices: async (ids) => {
      for (const id of ids) devices.delete(id);
    },
    listDevices: async () =>
      [...devices].map(([id, d]) => ({
        id,
        uid: String(d.uid),
        token: String(d.token),
        origin: d.origin,
      })),
    getUserMinistries: async (uids) =>
      new Map(
        uids
          .filter((uid) => ministries.has(uid))
          .map((uid) => [uid, new Set(ministries.get(uid))] as const),
      ),
    sendBatch: async (messages) => {
      calls.push(messages);
      return messages.map(({ token }): SendResult => {
        const code = opts.failures?.[token];
        return code ? { ok: false, code } : { ok: true };
      });
    },
    readPushConfig: async () => opts.config ?? null,
    now: () => clock.now,
  };

  return { deps, devices, calls, clock };
}
