import {
  collection,
  collectionGroup,
  getCountFromServer,
  getDocs,
  onSnapshot,
  query,
  where,
  type CollectionReference,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { FirebaseServices } from '../lib/firebase';
import type { StatsCallerResult } from '../stats/types';
import { callCallable } from './callable';
import { normalizeForSearch } from './normalize';

export type MinistryRole = 'member' | 'admin';

export type PersonRow = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role?: MinistryRole;
  createdAt?: Date | null;
};

export interface MinistryItem {
  id: string;
  name: string;
  city: string;
  nameNormalized: string;
}

/**
 * Leituras lançam o erro do SDK do Firestore sem tradução: a tela mostra o próprio texto em pt-BR,
 * nunca a mensagem crua. Escritas passam por `callable`, que traduz o erro (ver `callable.ts`).
 */
export interface MinistriesApi {
  /** Ordenada por name (pt-BR); a busca usa nameNormalized. */
  listMinistries(): Promise<MinistryItem[]>;
  /** collectionGroup('requests') where uid == uid. */
  subscribeMyRequests(
    uid: string,
    cb: (r: Array<{ ministryId: string; status: 'pending' | 'rejected' }>) => void,
    onError: (e: unknown) => void,
  ): () => void;
  /** getCountFromServer sobre pedidos pendentes do ministério. */
  countPending(ministryId: string): Promise<number>;
  /** Admin da app: pedidos pendentes em todos os ministérios. */
  countPendingAll(): Promise<number>;
  /** Pedidos pendentes do ministério. */
  listRequests(ministryId: string): Promise<PersonRow[]>;
  /** Membros do ministério. */
  listMembers(ministryId: string): Promise<PersonRow[]>;
  /** Gestão: pedidos pendentes de todos os ministérios, com o nome do ministério. */
  listAllPendingRequests(): Promise<
    Array<PersonRow & { ministryId: string; ministryName: string; ministryCity: string }>
  >;
  /** Admins da app: todos os users/{uid}, ordenados por nome. */
  listAppUsers(): Promise<Array<PersonRow & { appAdmin: boolean }>>;
  callable: {
    requestAccess(ministryId: string): Promise<void>;
    cancelRequest(ministryId: string): Promise<void>;
    approve(ministryId: string, uid: string): Promise<void>;
    reject(ministryId: string, uid: string): Promise<void>;
    setRole(ministryId: string, uid: string, role: MinistryRole): Promise<void>;
    removeMember(ministryId: string, uid: string): Promise<void>;
    createMinistry(name: string, city: string): Promise<{ ministryId: string }>;
    updateMinistry(ministryId: string, name: string, city: string): Promise<void>;
    setAppAdmin(uid: string, appAdmin: boolean): Promise<void>;
    getStats(ministryId?: string): Promise<StatsCallerResult>;
  };
}

const PENDING = 'pending';

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asDate(value: unknown): Date | null {
  const withToDate = value as { toDate?: unknown } | null | undefined;
  return typeof withToDate?.toDate === 'function' ? (withToDate.toDate as () => Date)() : null;
}

function toPersonRow(uid: string, data: DocumentData): PersonRow {
  return {
    uid,
    displayName: asString(data.displayName),
    email: asString(data.email),
    photoURL: asString(data.photoURL),
    createdAt: asDate(data.createdAt),
  };
}

function ministryIdOfDoc(doc: QueryDocumentSnapshot): string {
  return doc.ref.parent.parent?.id ?? '';
}

function byName(a: { displayName: string | null }, b: { displayName: string | null }): number {
  return (a.displayName ?? '').localeCompare(b.displayName ?? '', 'pt-BR');
}

export function createMinistriesApi({ db, loadFunctions }: FirebaseServices): MinistriesApi {
  async function call<T>(name: string, payload: unknown): Promise<T> {
    return callCallable<T>(async () => {
      const [{ httpsCallable }, functions] = await Promise.all([
        import('firebase/functions'),
        loadFunctions(),
      ]);
      return httpsCallable<unknown, T>(functions, name)(payload);
    });
  }

  const pendingOf = (base: CollectionReference | Query): Query<DocumentData> =>
    query(base, where('status', '==', PENDING));

  return {
    listMinistries: async () => {
      const snap = await getDocs(collection(db, 'ministries'));
      return snap.docs
        .map((d) => {
          const data = d.data();
          const name = String(data.name ?? '');
          return {
            id: d.id,
            name,
            city: String(data.city ?? ''),
            nameNormalized: asString(data.nameNormalized) ?? normalizeForSearch(name),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    },

    subscribeMyRequests: (uid, cb, onError) =>
      onSnapshot(
        query(collectionGroup(db, 'requests'), where('uid', '==', uid)),
        (snap) =>
          cb(
            snap.docs.map((d) => ({
              ministryId: ministryIdOfDoc(d),
              status: d.data().status as 'pending' | 'rejected',
            })),
          ),
        onError,
      ),

    countPending: async (ministryId) => {
      const snap = await getCountFromServer(
        pendingOf(collection(db, 'ministries', ministryId, 'requests')),
      );
      return snap.data().count;
    },

    countPendingAll: async () => {
      const snap = await getCountFromServer(pendingOf(collectionGroup(db, 'requests')));
      return snap.data().count;
    },

    listRequests: async (ministryId) => {
      const snap = await getDocs(pendingOf(collection(db, 'ministries', ministryId, 'requests')));
      return snap.docs.map((d) => toPersonRow(d.id, d.data()));
    },

    listMembers: async (ministryId) => {
      const snap = await getDocs(collection(db, 'ministries', ministryId, 'members'));
      return snap.docs
        .map((d) => ({ ...toPersonRow(d.id, d.data()), role: d.data().role as MinistryRole }))
        .sort(byName);
    },

    listAllPendingRequests: async () => {
      const [requests, ministries] = await Promise.all([
        getDocs(pendingOf(collectionGroup(db, 'requests'))),
        getDocs(collection(db, 'ministries')),
      ]);
      const byId = new Map(
        ministries.docs.map((d) => [
          d.id,
          { name: String(d.data().name ?? ''), city: String(d.data().city ?? '') },
        ]),
      );
      return requests.docs.map((d) => {
        const ministryId = ministryIdOfDoc(d);
        const ministry = byId.get(ministryId);
        return {
          ...toPersonRow(d.id, d.data()),
          ministryId,
          ministryName: ministry?.name ?? '',
          ministryCity: ministry?.city ?? '',
        };
      });
    },

    listAppUsers: async () => {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs
        .map((d) => ({ ...toPersonRow(d.id, d.data()), appAdmin: d.data().appAdmin === true }))
        .sort(byName);
    },

    callable: {
      requestAccess: (ministryId) => call('requestMinistryAccess', { ministryId }),
      cancelRequest: (ministryId) => call('cancelMinistryRequest', { ministryId }),
      approve: (ministryId, uid) => call('approveMinistryRequest', { ministryId, uid }),
      reject: (ministryId, uid) => call('rejectMinistryRequest', { ministryId, uid }),
      setRole: (ministryId, uid, role) => call('setMinistryMemberRole', { ministryId, uid, role }),
      removeMember: (ministryId, uid) => call('removeMinistryMember', { ministryId, uid }),
      createMinistry: (name, city) => call('createMinistry', { name, city }),
      updateMinistry: (ministryId, name, city) =>
        call('updateMinistry', { ministryId, name, city }),
      setAppAdmin: (uid, appAdmin) => call('setAppAdmin', { uid, appAdmin }),
      getStats: (ministryId) => call('getStats', ministryId ? { ministryId } : {}),
    },
  };
}
