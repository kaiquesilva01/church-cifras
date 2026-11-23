import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { ROLES, type Role } from '../roles';
import type { DeviceRecord, PushDeps, SendResult } from './types';

// Limite de referências por getAll (igual a statsDeps) e de operações por batch do Firestore.
const GET_ALL_BLOCK = 300;
const DELETE_BLOCK = 500;

// Ícone e distintivo saem do site da origem do link (o aparelho de teste usa o site de teste).
const siteAsset = (link: string, path: string): string => new URL(path, link).href;

/** Implementação real de PushDeps com firebase-admin. Sem lógica: só traduz chamadas. */
export function createPushDeps(): PushDeps {
  return {
    getUserRole: async (uid) => (await getFirestore().doc(`users/${uid}`).get()).data()?.role,
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
    // getAll em blocos: funciona para qualquer quantidade de uids (where 'in' limita a 30).
    // uid inválido (vazio ou com "/") não tem papel: o aparelho cai em "stale" e é apagado.
    getUserRoles: async (uids) => {
      const roles = new Map<string, Role>();
      const valid = uids.filter((uid) => uid !== '' && !uid.includes('/'));
      if (valid.length === 0) return roles;
      const db = getFirestore();
      for (let start = 0; start < valid.length; start += GET_ALL_BLOCK) {
        const block = valid.slice(start, start + GET_ALL_BLOCK);
        const snaps = await db.getAll(...block.map((uid) => db.doc(`users/${uid}`)));
        for (const snap of snaps) {
          const role = ROLES.find((r) => r === snap.data()?.role);
          if (role) roles.set(snap.id, role);
        }
      }
      return roles;
    },
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
