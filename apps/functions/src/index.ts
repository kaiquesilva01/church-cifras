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
  deleteArrangement as deleteArrangementLogic,
  deleteSong as deleteSongLogic,
  updateSongMeta as updateSongMetaLogic,
  type AdminDeps,
} from './songs/adminSongs';
import { discardUpload as discardUploadLogic, type DiscardDeps } from './songs/discardUpload';
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
  replaceIfGenerated: (songId, slug, data) => {
    const db = getFirestore();
    const ref = db.doc(`songs/${songId}/arrangements/${slug}`);
    return db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (!current) return 'missing' as const;
      if (current.source === 'handmade') return 'handmade' as const;
      if (current.storagePath === data.storagePath) return 'same-file' as const;
      tx.set(ref, data);
      return { previousPath: String(current.storagePath) };
    });
  },
  deleteFile: async (path) => {
    await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
  },
  fileExists: async (path) => (await getStorage().bucket().file(path).exists())[0],
  getFileOwner: async (path) => {
    const file = getStorage().bucket().file(path);
    if (!(await file.exists())[0]) return null;
    const [metadata] = await file.getMetadata();
    const uploadedBy = metadata.metadata?.uploadedBy;
    return typeof uploadedBy === 'string' ? uploadedBy : null;
  },
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

const discardDeps: DiscardDeps = {
  getUploader: async (path) => {
    const file = getStorage().bucket().file(path);
    if (!(await file.exists())[0]) return 'missing' as const;
    const [metadata] = await file.getMetadata();
    const uploadedBy = metadata.metadata?.uploadedBy;
    return { uploadedBy: typeof uploadedBy === 'string' ? uploadedBy : undefined };
  },
  isReferenced: async (songId, slug, path) => {
    const data = (await getFirestore().doc(`songs/${songId}/arrangements/${slug}`).get()).data();
    return data?.storagePath === path;
  },
  deleteFile: async (path) => {
    await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
  },
};

export const discardUpload = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  await requireRole(deps, uid, ['member', 'admin']);
  const data = (request.data ?? {}) as Record<string, unknown>;
  return discardUploadLogic(discardDeps, { uid: uid as string, storagePath: data.storagePath });
});

const adminDeps: AdminDeps = {
  getSong: async (id) => {
    const data = (await getFirestore().doc(`songs/${id}`).get()).data();
    return data
      ? { title: String(data.title ?? ''), artistName: String(data.artistName ?? '') }
      : null;
  },
  listArrangements: async (songId) =>
    (await getFirestore().collection(`songs/${songId}/arrangements`).get()).docs.map((d) => ({
      slug: d.id,
      key: String(d.data().key ?? ''),
      source: String(d.data().source ?? ''),
      storagePath: String(d.data().storagePath ?? ''),
    })),
  deleteArrangementDoc: async (songId, slug) => {
    await getFirestore().doc(`songs/${songId}/arrangements/${slug}`).delete();
  },
  deleteArrangementGuarded: (songId, decide) => {
    const db = getFirestore();
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(db.collection(`songs/${songId}/arrangements`));
      const target = decide(
        snap.docs.map((d) => ({
          slug: d.id,
          key: String(d.data().key ?? ''),
          source: String(d.data().source ?? ''),
          storagePath: String(d.data().storagePath ?? ''),
        })),
      );
      tx.delete(db.doc(`songs/${songId}/arrangements/${target.slug}`));
      return target;
    });
  },
  deleteSongDoc: async (songId) => {
    await getFirestore().doc(`songs/${songId}`).delete();
  },
  deleteFile: async (path) => {
    await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
  },
  findSongsByIdentity: async (titleNormalized, artistId) => {
    const snap = await getFirestore()
      .collection('songs')
      .where('titleNormalized', '==', titleNormalized)
      .where('artistId', '==', artistId)
      .limit(2)
      .get();
    return snap.docs.map((d) => d.id);
  },
  updateSong: async (songId, data) => {
    await getFirestore().doc(`songs/${songId}`).update(data);
  },
  now: () => new Date(),
};

export const updateSongMeta = onCall({ region: REGION }, async (request) => {
  await requireRole(deps, request.auth?.uid, ['admin']);
  const data = (request.data ?? {}) as Record<string, unknown>;
  return updateSongMetaLogic(adminDeps, {
    songId: data.songId,
    title: data.title,
    artistName: data.artistName,
  });
});

export const deleteArrangement = onCall({ region: REGION }, async (request) => {
  await requireRole(deps, request.auth?.uid, ['admin']);
  const data = (request.data ?? {}) as Record<string, unknown>;
  return deleteArrangementLogic(adminDeps, { songId: data.songId, key: data.key });
});

export const deleteSong = onCall({ region: REGION }, async (request) => {
  await requireRole(deps, request.auth?.uid, ['admin']);
  const data = (request.data ?? {}) as Record<string, unknown>;
  return deleteSongLogic(adminDeps, { songId: data.songId });
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
