import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import * as functionsV1 from 'firebase-functions/v1';
import { onCall } from 'firebase-functions/v2/https';
import { buildHealth } from './health';
import { parseAdminEmails } from './roles';
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
        displayName: user.displayName,
        photoURL: user.photoURL,
      },
      parseAdminEmails(adminEmails.value()),
    );
  });

export const setUserRole = onCall({ region: REGION }, (request) => {
  const data = (request.data ?? {}) as { uid?: unknown; role?: unknown };
  return changeUserRole(deps, {
    callerUid: request.auth?.uid,
    callerRole: request.auth?.token.role,
    targetUid: data.uid,
    newRole: data.role,
  });
});
