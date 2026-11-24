import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { createMinistryDeps } from '../ministries/adminDeps';
import type { DeviceRecord, PushDeps, SendResult } from './types';

// Operações por batch do Firestore.
const DELETE_BLOCK = 500;
// `in` do Firestore aceita até 30 valores por consulta.
const IN_BLOCK = 30;

// Ícone e distintivo saem do site da origem do link (o aparelho de teste usa o site de teste).
const siteAsset = (link: string, path: string): string => new URL(path, link).href;

/** uid -> Set de ministryId, pelo grupo `members` (uid é o campo do documento). Só traduz consultas. */
export async function ministriesOfUids(uids: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const valid = [...new Set(uids)].filter((uid) => uid !== '' && !uid.includes('/'));
  const db = getFirestore();
  for (let start = 0; start < valid.length; start += IN_BLOCK) {
    const snap = await db
      .collectionGroup('members')
      .where('uid', 'in', valid.slice(start, start + IN_BLOCK))
      .get();
    for (const d of snap.docs) {
      const mid = d.ref.parent.parent?.id;
      const uid = String(d.data().uid ?? '');
      if (!mid || !uid) continue;
      const set = out.get(uid) ?? new Set<string>();
      set.add(mid);
      out.set(uid, set);
    }
  }
  return out;
}

/** Implementação real de PushDeps com firebase-admin. Sem lógica: só traduz chamadas. */
export function createPushDeps(): PushDeps {
  const ministry = createMinistryDeps();
  return {
    readUser: ministry.readUser,
    listMembershipsOfUser: ministry.listMembershipsOfUser,
    getDeviceOwner: async (id) => {
      const owner = (await getFirestore().doc(`pushDevices/${id}`).get()).data()?.uid;
      return typeof owner === 'string' ? owner : null;
    },
    // merge: re-registro do mesmo dono omite createdAt e não pode apagá-lo.
    writeDevice: async (id, data) => {
      await getFirestore().doc(`pushDevices/${id}`).set(data, { merge: true });
    },
    deleteDevices: async (ids) => {
      const db = getFirestore();
      for (let start = 0; start < ids.length; start += DELETE_BLOCK) {
        const batch = db.batch();
        for (const id of ids.slice(start, start + DELETE_BLOCK)) {
          batch.delete(db.doc(`pushDevices/${id}`));
        }
        await batch.commit();
      }
    },
    listDevices: async (): Promise<DeviceRecord[]> =>
      (await getFirestore().collection('pushDevices').get()).docs.map((d) => ({
        id: d.id,
        uid: String(d.data().uid ?? ''),
        token: String(d.data().token ?? ''),
        origin: d.data().origin,
      })),
    // uid inválido não tem ministério: o aparelho cai em "stale" e é apagado.
    getUserMinistries: ministriesOfUids,
    // sendEach: uma mensagem por token (sendEachForMulticast está deprecado para tokens no 14.5.1).
    sendBatch: async (messages): Promise<SendResult[]> => {
      const response = await getMessaging().sendEach(
        messages.map(({ token, message }) => ({
          token,
          notification: { title: message.title, body: message.body },
          webpush: {
            notification: {
              tag: message.tag,
              // Com a mesma tag, um aviso novo substitui o antigo; renotify faz o aparelho alertar de novo.
              renotify: true,
              icon: siteAsset(message.link, '/icons/icon-192.png'),
              badge: siteAsset(message.link, '/icons/badge-96.png'),
            },
            fcmOptions: { link: message.link },
          },
        })),
      );
      return response.responses.map((r): SendResult =>
        r.success ? { ok: true } : { ok: false, code: r.error?.code ?? 'unknown' },
      );
    },
    readPushConfig: async () => (await getFirestore().doc('config/push').get()).data() ?? null,
    now: () => new Date(),
  };
}
