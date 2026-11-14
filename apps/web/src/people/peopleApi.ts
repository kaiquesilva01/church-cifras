import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { isRole, type Role } from '../auth/roles';
import type { FirebaseServices } from '../lib/firebase';

export interface PersonRow {
  uid: string;
  displayName: string;
  email: string;
  role: Role;
}

export interface PeopleApi {
  listUsers(): Promise<PersonRow[]>;
  setRole(uid: string, role: Role): Promise<void>;
}

export function toPersonRow(uid: string, data: Record<string, unknown>): PersonRow {
  const role = isRole(data.role) ? data.role : 'viewer';
  return {
    uid,
    displayName: String(data.displayName ?? ''),
    email: String(data.email ?? ''),
    role,
  };
}

export function createPeopleApi({ db, functions }: FirebaseServices): PeopleApi {
  const callSetUserRole = httpsCallable<{ uid: string; role: Role }, unknown>(
    functions,
    'setUserRole',
  );
  return {
    listUsers: async () => {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('displayName')));
      return snap.docs.map((d) => toPersonRow(d.id, d.data()));
    },
    setRole: async (uid, role) => {
      await callSetUserRole({ uid, role });
    },
  };
}
