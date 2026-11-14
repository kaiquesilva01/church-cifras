import {
  GoogleAuthProvider,
  getIdToken,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { clearIndexedDbPersistence, doc, onSnapshot, terminate } from 'firebase/firestore';
import type { FirebaseServices } from '../lib/firebase';
import type { AuthGateway } from './AuthProvider';
import { isRole } from './roles';

export function createAuthGateway(
  { auth, db }: FirebaseServices,
  { reload = () => window.location.reload() }: { reload?: () => void } = {},
): AuthGateway {
  return {
    onUser: (cb) =>
      onAuthStateChanged(auth, (u) =>
        cb(
          u && {
            uid: u.uid,
            displayName: u.displayName,
            email: u.email,
            photoURL: u.photoURL,
          },
        ),
      ),
    onUserDoc: (uid, cb) =>
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          const role: unknown = snap.data()?.role;
          cb(isRole(role) ? role : undefined);
        },
        (error) => {
          console.warn('Falha ao carregar o perfil do usuário', error);
          cb(undefined);
        },
      ),
    getClaimRole: async () => {
      if (!auth.currentUser) return undefined;
      const { claims } = await getIdTokenResult(auth.currentUser);
      return isRole(claims.role) ? claims.role : undefined;
    },
    refreshToken: async () => {
      if (auth.currentUser) await getIdToken(auth.currentUser, true);
    },
    signIn: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    // O cache persistente do Firestore guarda dados da pessoa anterior: apaga e recarrega.
    signOut: async () => {
      await signOut(auth);
      try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
      } catch (error) {
        console.warn('Falha ao limpar o cache local', error);
      }
      reload();
    },
  };
}
