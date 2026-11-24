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
import {
  clearIndexedDbPersistence,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  terminate,
  where,
} from 'firebase/firestore';
import type { FirebaseServices } from '../lib/firebase';
import type { AuthGateway } from './AuthProvider';
import { setRemovedNotice } from './removedNotice';

export function createAuthGateway(
  { auth, db }: FirebaseServices,
  {
    reload = () => window.location.reload(),
    beforeSignOut,
  }: { reload?: () => void; beforeSignOut?: () => Promise<void> } = {},
): AuthGateway {
  // O cache persistente do Firestore e os PDFs do service worker são da pessoa anterior: apaga o que dá.
  const clearLocalCache = async () => {
    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch (error) {
      console.warn('Falha ao limpar o cache local', error);
    }
    try {
      await globalThis.caches?.delete('cifras-pdfs');
    } catch (error) {
      console.warn('Falha ao limpar o cache de PDFs', error);
    }
  };

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
    getClaims: async () => {
      if (!auth.currentUser) return { appAdmin: false, hasMinistry: false, canUploadSong: false };
      const { claims } = await getIdTokenResult(auth.currentUser);
      return {
        appAdmin: claims.appAdmin === true,
        hasMinistry: claims.hasMinistry === true,
        canUploadSong: claims.canUploadSong === true,
      };
    },
    onUserDoc: (uid, cb) =>
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => cb({ appAdmin: snap.data()?.appAdmin === true }),
        (error) => {
          console.warn('Falha ao carregar o perfil do usuário', error);
          cb({ appAdmin: false });
        },
      ),
    onMemberships: (uid, cb, onError) =>
      onSnapshot(
        query(collectionGroup(db, 'members'), where('uid', '==', uid)),
        (snap) =>
          cb(
            snap.docs.flatMap((d) => {
              const ministryId = d.ref.parent.parent?.id;
              const role: unknown = d.get('role');
              return ministryId && (role === 'member' || role === 'admin')
                ? [{ ministryId, role }]
                : [];
            }),
          ),
        onError,
      ),
    onMinistry: (ministryId, cb, onError) =>
      onSnapshot(
        doc(db, 'ministries', ministryId),
        (snap) => {
          const data = snap.data();
          cb(data ? { name: String(data.name ?? ''), city: String(data.city ?? '') } : null);
        },
        onError,
      ),
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
    signOut: async () => {
      // Antes do signOut: a callable de avisos exige sessão. Falha não impede o logout.
      try {
        await beforeSignOut?.();
      } catch (error) {
        console.warn('Falha ao desativar os avisos ao sair', error);
      }
      await signOut(auth);
      await clearLocalCache();
      reload();
    },
    // Vínculo removido: apaga o cache local e avisa na entrada, depois do reload.
    forgetLocalData: async (removedFrom) => {
      if (removedFrom) setRemovedNotice(removedFrom);
      await clearLocalCache();
      reload();
    },
  };
}
