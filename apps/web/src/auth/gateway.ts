import {
  GoogleAuthProvider,
  getIdToken,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { FirebaseServices } from '../lib/firebase';
import type { AuthGateway } from './AuthProvider';
import type { Role } from './roles';

export function createAuthGateway({ auth, db }: FirebaseServices): AuthGateway {
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
      onSnapshot(doc(db, 'users', uid), (snap) => {
        const role = snap.data()?.role as Role | undefined;
        cb(role);
      }),
    refreshToken: async () => {
      if (auth.currentUser) await getIdToken(auth.currentUser, true);
    },
    signIn: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    signOut: () => signOut(auth),
  };
}
