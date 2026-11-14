import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { connectStorageEmulator, getStorage, ref, uploadBytes } from 'firebase/storage';

// Smoke test do fluxo de upload contra os emuladores do docker compose.
// Uso: docker compose up -d --build && npm run smoke:upload
const PROJECT = 'demo-church-cifras';
const BUCKET = `${PROJECT}.appspot.com`;
const AUTH = 'http://localhost:9099';
const FIRESTORE = 'http://localhost:8080';
const STORAGE = 'http://localhost:9199';
const FUNCTIONS = 'http://localhost:5001';
const REGION = 'southamerica-east1';
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;

const runId = Date.now().toString(36);
const songId = `smoke${runId}`;
const PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
);

let step = 'start';
const log = (message) => console.log(`[smoke] ${message}`);
const fail = (message) => {
  throw new Error(message);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

async function signIn(email, sub) {
  const idToken = `${b64url({ alg: 'none' })}.${b64url({ sub, email, email_verified: true })}.`;
  const response = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestUri: 'http://localhost',
        returnSecureToken: true,
        postBody: `id_token=${idToken}&providerId=google.com`,
      }),
    },
  );
  if (!response.ok) fail(`sign-in ${email}: ${response.status} ${await response.text()}`);
  return (await response.json()).idToken;
}

function claims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

// Upload pelo SDK (como o app): o REST cru do emulador não envia o metadado uploadedBy
// exigido pelas regras do Storage. `user` = { storage } de signInSdk.
async function uploadFile(user, path, uploadedBy) {
  try {
    await uploadBytes(ref(user.storage, path), PDF, {
      contentType: 'application/pdf',
      customMetadata: { uploadedBy },
    });
    return { ok: true, status: 200 };
  } catch (error) {
    return { ok: false, status: error.status_ ?? error.customData?.status ?? 0, error };
  }
}

async function signInSdk(email, sub, name) {
  const app = initializeApp(
    { apiKey: 'demo-key', projectId: PROJECT, storageBucket: BUCKET },
    name,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH, { disableWarnings: true });
  const idToken = `${b64url({ alg: 'none' })}.${b64url({ sub, email, email_verified: true })}.`;
  const credential = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  await credential.user.getIdToken(true);
  const storage = getStorage(app);
  connectStorageEmulator(storage, 'localhost', 9199);
  return { storage };
}

async function fileStatus(token, path) {
  const response = await fetch(
    `${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.status;
}

const str = (stringValue) => ({ stringValue });
const emptyArray = { arrayValue: {} };

function songWrite(uid, id = songId) {
  return {
    update: {
      name: `projects/${PROJECT}/databases/(default)/documents/songs/${id}`,
      fields: {
        title: str(`Smoke ${id}`),
        titleNormalized: str(`smoke ${id}`),
        artistId: str('smoke-artist'),
        artistName: str('Smoke Artist'),
        keys: emptyArray,
        handmadeKeys: emptyArray,
        createdBy: str(uid),
      },
    },
    updateTransforms: [
      { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
    ],
  };
}

function arrangementWrite(uid, key, slug, storagePath, source, derivedFromKey, id = songId) {
  return {
    update: {
      name: `projects/${PROJECT}/databases/(default)/documents/songs/${id}/arrangements/${slug}`,
      fields: {
        key: str(key),
        storagePath: str(storagePath),
        source: str(source),
        derivedFromKey: derivedFromKey ? str(derivedFromKey) : { nullValue: null },
        writer: str(source === 'handmade' ? 'upload' : 'overlay'),
        chordCount: { integerValue: '12' },
        collisions: { integerValue: '0' },
        createdBy: str(uid),
      },
    },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
  };
}

function commit(token, writes) {
  return fetch(`${DOCS}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ writes }),
  });
}

async function getDoc(token, path) {
  const response = await fetch(`${DOCS}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) fail(`get ${path}: ${response.status} ${await response.text()}`);
  return (await response.json()).fields;
}

const arrayOf = (field) => (field?.arrayValue?.values ?? []).map((v) => v.stringValue).sort();

async function waitForSong(token, expected, label) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const fields = await getDoc(token, `songs/${songId}`);
    last = { keys: arrayOf(fields.keys), handmadeKeys: arrayOf(fields.handmadeKeys) };
    if (
      JSON.stringify(last.keys) === JSON.stringify(expected.keys) &&
      JSON.stringify(last.handmadeKeys) === JSON.stringify(expected.handmadeKeys)
    ) {
      return;
    }
    await sleep(1000);
  }
  fail(
    `${label}: trigger did not produce ${JSON.stringify(expected)} in 30s (last ${JSON.stringify(last)})`,
  );
}

const callReplace = (token, data) => callFunction('replaceArrangement', token, data);

async function callFunction(name, token, data) {
  const response = await fetch(`${FUNCTIONS}/${PROJECT}/${REGION}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function main() {
  step = 'sign in as admin';
  let admin = await signIn('admin@cifras.local', 'smoke-admin');
  const deadline = Date.now() + 40_000;
  while (claims(admin).role !== 'admin' && Date.now() < deadline) {
    await sleep(2000);
    admin = await signIn('admin@cifras.local', 'smoke-admin');
  }
  if (claims(admin).role !== 'admin') fail('admin role claim never appeared (onUserCreated)');
  const adminUid = claims(admin).user_id;
  const adminSdk = await signInSdk('admin@cifras.local', 'smoke-admin', `admin-${runId}`);
  log('admin signed in with role claim');

  step = 'sign in as viewer';
  const viewer = await signIn('viewer@cifras.local', 'smoke-viewer');
  const viewerSdk = await signInSdk('viewer@cifras.local', 'smoke-viewer', `viewer-${runId}`);

  step = 'admin uploads handmade C file';
  const cPath = `songs/${songId}/C-file${runId}c.pdf`;
  let response = await uploadFile(adminSdk, cPath, adminUid);
  if (!response.ok) fail(`upload C: ${response.status} ${response.error?.message}`);

  step = 'admin commits song + handmade C';
  response = await commit(admin, [
    songWrite(adminUid),
    arrangementWrite(adminUid, 'C', 'C', cPath, 'handmade', null),
  ]);
  if (!response.ok) fail(`commit song+C: ${response.status} ${await response.text()}`);

  step = 'trigger updates song.keys for C';
  await waitForSong(admin, { keys: ['C'], handmadeKeys: ['C'] }, 'C');
  log('song.keys contains C');

  // O viewer usa música/caminho NOVOS: o 403 só pode vir do papel, não de arquivo existente.
  const viewerUid = claims(viewer).user_id;
  const viewerSong = `${songId}v`;
  const viewerPath = `songs/${viewerSong}/C-file${runId}v.pdf`;

  step = 'viewer storage upload is rejected';
  response = await uploadFile(viewerSdk, viewerPath, viewerUid);
  if (response.status !== 403) fail(`viewer upload expected 403, got ${response.status}`);
  log('viewer storage upload -> 403');

  step = 'viewer commit is rejected';
  response = await commit(viewer, [
    songWrite(viewerUid, viewerSong),
    arrangementWrite(viewerUid, 'C', 'C', viewerPath, 'handmade', null, viewerSong),
  ]);
  if (response.status !== 403) fail(`viewer commit expected 403, got ${response.status}`);
  log('viewer commit -> 403');

  step = 'viewer replaceArrangement and discardUpload are PERMISSION_DENIED';
  let denied = await callReplace(viewer, {
    songId,
    key: 'C',
    storagePath: viewerPath,
    chordCount: 3,
  });
  if (denied.body?.error?.status !== 'PERMISSION_DENIED') {
    fail(
      `viewer replace expected PERMISSION_DENIED, got ${denied.status} ${JSON.stringify(denied.body)}`,
    );
  }
  denied = await callFunction('discardUpload', viewer, { storagePath: cPath });
  if (denied.body?.error?.status !== 'PERMISSION_DENIED') {
    fail(
      `viewer discard expected PERMISSION_DENIED, got ${denied.status} ${JSON.stringify(denied.body)}`,
    );
  }
  log('viewer replaceArrangement/discardUpload -> PERMISSION_DENIED');

  step = 'admin adds generated D with its own file';
  const dOld = `songs/${songId}/D-file${runId}d.pdf`;
  response = await uploadFile(adminSdk, dOld, adminUid);
  if (!response.ok) fail(`upload D: ${response.status} ${response.error?.message}`);
  response = await commit(admin, [arrangementWrite(adminUid, 'D', 'D', dOld, 'generated', 'C')]);
  if (!response.ok) fail(`commit generated D: ${response.status} ${await response.text()}`);
  await waitForSong(admin, { keys: ['C', 'D'], handmadeKeys: ['C'] }, 'generated D');

  step = 'replaceArrangement replaces generated D';
  const dNew = `songs/${songId}/D-file${runId}n.pdf`;
  response = await uploadFile(adminSdk, dNew, adminUid);
  if (!response.ok) fail(`upload new D: ${response.status} ${response.error?.message}`);
  const call = { songId, key: 'D', storagePath: dNew, chordCount: 15 };
  let result = await callReplace(admin, call);
  if (result.status !== 200 || !result.body.result) {
    fail(`replaceArrangement D: ${result.status} ${JSON.stringify(result.body)}`);
  }
  const d = await getDoc(admin, `songs/${songId}/arrangements/D`);
  if (d.source.stringValue !== 'handmade' || d.storagePath.stringValue !== dNew) {
    fail(`D after replace: ${JSON.stringify(d)}`);
  }
  const oldStatus = await fileStatus(admin, dOld);
  if (oldStatus !== 404) fail(`old D file expected 404, got ${oldStatus}`);
  await waitForSong(admin, { keys: ['C', 'D'], handmadeKeys: ['C', 'D'] }, 'after replace');
  log('replaceArrangement: D handmade, old file deleted, handmadeKeys updated');

  step = 'replaceArrangement on handmade is FAILED_PRECONDITION';
  const dAgain = `songs/${songId}/D-file${runId}x.pdf`;
  response = await uploadFile(adminSdk, dAgain, adminUid);
  if (!response.ok) fail(`upload third D: ${response.status} ${response.error?.message}`);
  result = await callReplace(admin, { ...call, storagePath: dAgain });
  if (result.body?.error?.status !== 'FAILED_PRECONDITION') {
    fail(`expected FAILED_PRECONDITION, got ${result.status} ${JSON.stringify(result.body)}`);
  }
  log('replace on handmade -> FAILED_PRECONDITION');

  step = 'discardUpload removes an orphan file';
  const orphan = `songs/${songId}/E-file${runId}o.pdf`;
  response = await uploadFile(adminSdk, orphan, adminUid);
  if (!response.ok) fail(`upload orphan: ${response.status} ${response.error?.message}`);
  result = await callFunction('discardUpload', admin, { storagePath: orphan });
  if (result.status !== 200)
    fail(`discard orphan: ${result.status} ${JSON.stringify(result.body)}`);
  const orphanStatus = await fileStatus(admin, orphan);
  if (orphanStatus !== 404) fail(`orphan expected 404 after discard, got ${orphanStatus}`);
  log('discardUpload: orphan deleted (404)');

  step = 'discardUpload refuses a referenced file';
  result = await callFunction('discardUpload', admin, { storagePath: cPath });
  if (result.body?.error?.status !== 'FAILED_PRECONDITION') {
    fail(
      `discard referenced expected FAILED_PRECONDITION, got ${result.status} ${JSON.stringify(result.body)}`,
    );
  }
  const keptStatus = await fileStatus(admin, cPath);
  if (keptStatus !== 200) fail(`referenced file expected 200, got ${keptStatus}`);
  log('discardUpload on referenced file -> FAILED_PRECONDITION');
}

try {
  await main();
  console.log('OK');
} catch (error) {
  console.error(`FAIL at step "${step}": ${error.message}`);
  process.exit(1);
}
