import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineString } from 'firebase-functions/params';
import * as functionsV1 from 'firebase-functions/v1';
import { onCall } from 'firebase-functions/v2/https';
import { requireRole } from './auth/requireRole';
import { buildHealth } from './health';
import { parseAdminEmails, ROLES } from './roles';
import {
  replaceArrangement as replaceArrangementLogic,
  type ReplaceDeps,
} from './songs/replaceArrangement';
import { changeUserRole, createUserProfile, type UserDeps } from './users';

if (getApps().length === 0) initializeApp();

const REGION = 'southamerica-east1';
const adminEmails = defineString('ADMIN_EMAILS');

const deps: UserDeps = {
  setClaims: (uid, claims) => getAuth().setCustomUserClaims(uid, claims),
  writeUser: async (uid, data, merge) => {
    await getFirestore().doc(`users/${uid}`).set(data, { merge });
  },
  userExists: async (uid) => (await getFirestore().doc(`users/${uid}`).get()).exists,
  getUserRole: async (uid) => {
    const role = (await getFirestore().doc(`users/${uid}`).get()).data()?.role;
    return ROLES.find((r) => r === role);
  },
  now: () => new Date(),
};

export const health = onCall({ region: REGION }, () => buildHealth(new Date()));

export const onUserCreated = functionsV1
  .region(REGION)
  .auth.user()
  .onCreate(async (user) => {
    await createUserProfile(
      deps,
      {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        photoURL: user.photoURL,
      },
      parseAdminEmails(adminEmails.value()),
    );
  });

export { onArrangementWritten } from './songs/keys';

const replaceDeps: ReplaceDeps = {
  getArrangement: async (songId, slug) => {
    const data = (await getFirestore().doc(`songs/${songId}/arrangements/${slug}`).get()).data();
    if (!data) return null;
    return { source: String(data.source), storagePath: String(data.storagePath) };
  },
  replaceArrangementDoc: async (songId, slug, data) => {
    await getFirestore().doc(`songs/${songId}/arrangements/${slug}`).set(data);
  },
  deleteFile: async (path) => {
    await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
  },
  fileExists: async (path) => (await getStorage().bucket().file(path).exists())[0],
  now: () => new Date(),
};

export const replaceArrangement = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  await requireRole(deps, uid, ['member', 'admin']);
  const data = (request.data ?? {}) as Record<string, unknown>;
  return replaceArrangementLogic(replaceDeps, {
    uid: uid as string,
    songId: data.songId,
    key: data.key,
    storagePath: data.storagePath,
    chordCount: data.chordCount,
  });
});

export const setUserRole = onCall({ region: REGION }, async (request) => {
  const data = (request.data ?? {}) as { uid?: unknown; role?: unknown };
  const callerRole = await requireRole(deps, request.auth?.uid, ['admin']);
  return changeUserRole(deps, {
    callerUid: request.auth?.uid,
    callerRole,
    targetUid: data.uid,
    newRole: data.role,
  });
});
