import { _getInstance, type PopupRedirectResolverInternal } from '@firebase/auth/internal';
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
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
    // Auth starts without a popup resolver (keeps the Google iframe out of startup), but
    // signInWithPopup waits for that iframe before window.open and mobile browsers block the popup
    // once the user gesture is lost. getRedirectResult would NOT help: with no pending redirect it
    // never reaches resolver._initialize. signInWithPopup resolves the resolver through _getInstance
    // (a per-class cached singleton) and _initialize is memoized per auth, so warming that same
    // instance here makes the later popup reuse the already-open iframe. _getInstance is an internal
    // API: @firebase/auth is pinned to an exact version and the E2E in e2e/auth.spec.ts asserts the
    // iframe is attached on /login.
    prepareSignIn: async () => {
      try {
        await _getInstance<PopupRedirectResolverInternal>(browserPopupRedirectResolver)._initialize(
          auth as Parameters<PopupRedirectResolverInternal['_initialize']>[0],
        );
      } catch {
        // Best effort: signIn still works, it just may open the popup later.
      }
    },
    signIn: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver);
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
      // Aparelho compartilhado: os PDFs em cache do service worker são da pessoa anterior.
      try {
        await globalThis.caches?.delete('cifras-pdfs');
      } catch (error) {
        console.warn('Falha ao limpar o cache de PDFs', error);
      }
      reload();
    },
  };
}
