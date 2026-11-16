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

async function waitForSong(token, expected, label, id = songId) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const fields = await getDoc(token, `songs/${id}`);
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

  await generatedKeysScenario(admin, adminSdk, adminUid);
  const member = await foreignFileScenario(admin, adminSdk, adminUid);
  await adminCallablesScenario(admin, adminSdk, adminUid, member);
}

// Tom gerado pelo cliente (viewer de transposição): derivedFromKey precisa ser um
// handmade existente do mesmo modo.
async function generatedKeysScenario(admin, adminSdk, adminUid) {
  step = 'admin adds generated E from handmade C';
  const ePath = `songs/${songId}/E-file${runId}e.pdf`;
  let response = await uploadFile(adminSdk, ePath, adminUid);
  if (!response.ok) fail(`upload E: ${response.status} ${response.error?.message}`);
  response = await commit(admin, [arrangementWrite(adminUid, 'E', 'E', ePath, 'generated', 'C')]);
  if (!response.ok) fail(`commit generated E: ${response.status} ${await response.text()}`);
  await waitForSong(admin, { keys: ['C', 'D', 'E'], handmadeKeys: ['C', 'D'] }, 'generated E');
  log('generated E from handmade C -> OK');

  step = 'generated from a generated source is rejected';
  const fPath = `songs/${songId}/F-file${runId}f.pdf`;
  response = await uploadFile(adminSdk, fPath, adminUid);
  if (!response.ok) fail(`upload F: ${response.status} ${response.error?.message}`);
  response = await commit(admin, [arrangementWrite(adminUid, 'F', 'F', fPath, 'generated', 'E')]);
  if (response.status !== 403)
    fail(`generated from generated expected 403, got ${response.status}`);
  log('generated F from generated E -> 403');

  step = 'generated of a different mode is rejected';
  const amPath = `songs/${songId}/Am-file${runId}a.pdf`;
  response = await uploadFile(adminSdk, amPath, adminUid);
  if (!response.ok) fail(`upload Am: ${response.status} ${response.error?.message}`);
  response = await commit(admin, [
    arrangementWrite(adminUid, 'Am', 'Am', amPath, 'generated', 'C'),
  ]);
  if (response.status !== 403) fail(`generated Am from C expected 403, got ${response.status}`);
  log('generated Am from major C -> 403');
}

// replaceArrangement só aceita arquivo enviado pelo próprio chamador.
async function foreignFileScenario(admin, adminSdk, adminUid) {
  step = 'promote a second user to member';
  await signIn('member@cifras.local', 'smoke-member');
  let member = await signIn('member@cifras.local', 'smoke-member');
  const memberUid = claims(member).user_id;
  // O doc users/{uid} nasce no trigger onUserCreated: tenta de novo enquanto NOT_FOUND.
  let result;
  const retryUntil = Date.now() + 30_000;
  do {
    result = await callFunction('setUserRole', admin, { uid: memberUid, role: 'member' });
    if (result.body?.error?.status !== 'NOT_FOUND') break;
    await sleep(1000);
  } while (Date.now() < retryUntil);
  if (result.status !== 200) fail(`setUserRole: ${result.status} ${JSON.stringify(result.body)}`);
  // Novo login para renovar as claims.
  member = await signIn('member@cifras.local', 'smoke-member');
  if (claims(member).role !== 'member') fail(`member claim missing: ${claims(member).role}`);
  const memberSdk = await signInSdk('member@cifras.local', 'smoke-member', `member-${runId}`);

  step = 'admin adds generated G, member uploads a file for it';
  const gOld = `songs/${songId}/G-file${runId}g.pdf`;
  let response = await uploadFile(adminSdk, gOld, adminUid);
  if (!response.ok) fail(`upload G: ${response.status} ${response.error?.message}`);
  response = await commit(admin, [arrangementWrite(adminUid, 'G', 'G', gOld, 'generated', 'C')]);
  if (!response.ok) fail(`commit generated G: ${response.status} ${await response.text()}`);
  const foreign = `songs/${songId}/G-file${runId}m.pdf`;
  response = await uploadFile(memberSdk, foreign, memberUid);
  if (!response.ok) fail(`member upload: ${response.status} ${response.error?.message}`);

  step = 'admin replaceArrangement with the member file is PERMISSION_DENIED';
  result = await callReplace(admin, { songId, key: 'G', storagePath: foreign, chordCount: 9 });
  if (result.body?.error?.status !== 'PERMISSION_DENIED') {
    fail(
      `foreign file expected PERMISSION_DENIED, got ${result.status} ${JSON.stringify(result.body)}`,
    );
  }
  const g = await getDoc(admin, `songs/${songId}/arrangements/G`);
  if (g.source.stringValue !== 'generated' || g.storagePath.stringValue !== gOld) {
    fail(`G changed after denied replace: ${JSON.stringify(g)}`);
  }
  log('replaceArrangement with another user file -> PERMISSION_DENIED');
  return member;
}

async function docStatus(token, path) {
  const response = await fetch(`${DOCS}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.status;
}

function expectStatus(result, expected, label) {
  if (result.body?.error?.status !== expected) {
    fail(`${label}: expected ${expected}, got ${result.status} ${JSON.stringify(result.body)}`);
  }
}

function expectOk(result, label) {
  if (result.status !== 200 || !result.body.result) {
    fail(`${label}: ${result.status} ${JSON.stringify(result.body)}`);
  }
}

async function expectGone(admin, docPath, filePath, label) {
  const doc = await docStatus(admin, docPath);
  if (doc !== 404) fail(`${label}: doc ${docPath} expected 404, got ${doc}`);
  const file = await fileStatus(admin, filePath);
  if (file !== 404) fail(`${label}: file ${filePath} expected 404, got ${file}`);
}

// Cria uma música com arranjos [key, source, derivedFromKey]; devolve key -> storagePath.
async function seedSong(admin, adminSdk, adminUid, id, arrangements) {
  const paths = {};
  const handmade = [songWrite(adminUid, id)];
  const generated = [];
  for (const [key, source, derivedFrom] of arrangements) {
    const path = `songs/${id}/${key}-file${runId}.pdf`;
    const uploaded = await uploadFile(adminSdk, path, adminUid);
    if (!uploaded.ok) {
      fail(`seed upload ${id}/${key}: ${uploaded.status} ${uploaded.error?.message}`);
    }
    paths[key] = path;
    const write = arrangementWrite(adminUid, key, key, path, source, derivedFrom, id);
    (source === 'handmade' ? handmade : generated).push(write);
  }
  // As regras exigem que o handmade de origem já exista: gerados vão num commit à parte.
  for (const writes of [handmade, generated]) {
    const response = await commit(admin, writes);
    if (!response.ok) fail(`seed commit ${id}: ${response.status} ${await response.text()}`);
  }
  return paths;
}

// Callables de admin: edição de metadados, remoção de arranjos e de músicas.
async function adminCallablesScenario(admin, adminSdk, adminUid, member) {
  step = 'seed songs for admin callables';
  const songA = `${songId}a`;
  const songB = `${songId}b`;
  const a = await seedSong(admin, adminSdk, adminUid, songA, [
    ['C', 'handmade', null],
    ['D', 'generated', 'C'],
    ['E', 'generated', 'C'],
  ]);
  const b = await seedSong(admin, adminSdk, adminUid, songB, [
    ['C', 'handmade', null],
    ['D', 'generated', 'C'],
  ]);
  await waitForSong(admin, { keys: ['C', 'D', 'E'], handmadeKeys: ['C'] }, 'seed A', songA);
  await waitForSong(admin, { keys: ['C', 'D'], handmadeKeys: ['C'] }, 'seed B', songB);

  step = 'member calling admin callables is PERMISSION_DENIED';
  expectStatus(
    await callFunction('updateSongMeta', member, {
      songId: songA,
      title: 'Hack',
      artistName: 'Hack',
    }),
    'PERMISSION_DENIED',
    'member updateSongMeta',
  );
  expectStatus(
    await callFunction('deleteArrangement', member, { songId: songA, key: 'D' }),
    'PERMISSION_DENIED',
    'member deleteArrangement',
  );
  expectStatus(
    await callFunction('deleteSong', member, { songId: songA }),
    'PERMISSION_DENIED',
    'member deleteSong',
  );
  const untouched = await getDoc(admin, `songs/${songA}`);
  if (untouched.title.stringValue !== `Smoke ${songA}`) fail('song A changed after denied calls');
  if ((await fileStatus(admin, a.D)) !== 200) fail('file D removed by a denied call');
  log('member updateSongMeta/deleteArrangement/deleteSong -> PERMISSION_DENIED');

  step = 'updateSongMeta renames a song';
  let result = await callFunction('updateSongMeta', admin, {
    songId: songA,
    title: `Renomeada ${runId}`,
    artistName: 'Outro Cantor',
  });
  expectOk(result, 'updateSongMeta');
  const renamed = await getDoc(admin, `songs/${songA}`);
  if (
    renamed.title.stringValue !== `Renomeada ${runId}` ||
    renamed.titleNormalized.stringValue !== `renomeada ${runId}` ||
    renamed.artistName.stringValue !== 'Outro Cantor' ||
    renamed.artistId.stringValue !== 'outro-cantor'
  ) {
    fail(`song A after rename: ${JSON.stringify(renamed)}`);
  }
  log('updateSongMeta: title/artist/titleNormalized/artistId updated');

  step = 'updateSongMeta to another song identity is ALREADY_EXISTS';
  result = await callFunction('updateSongMeta', admin, {
    songId: songA,
    title: `Smoke ${songB}`,
    artistName: 'Smoke Artist',
  });
  expectStatus(result, 'ALREADY_EXISTS', 'updateSongMeta duplicate');
  const afterDup = await getDoc(admin, `songs/${songA}`);
  if (afterDup.titleNormalized.stringValue !== `renomeada ${runId}`) {
    fail(`song A changed after ALREADY_EXISTS: ${JSON.stringify(afterDup)}`);
  }
  log('updateSongMeta duplicate identity -> ALREADY_EXISTS');

  step = 'deleteArrangement removes a generated key';
  result = await callFunction('deleteArrangement', admin, { songId: songA, key: 'D' });
  expectOk(result, 'deleteArrangement D');
  await expectGone(admin, `songs/${songA}/arrangements/D`, a.D, 'delete generated D');
  await waitForSong(admin, { keys: ['C', 'E'], handmadeKeys: ['C'] }, 'after delete D', songA);
  log('deleteArrangement generated D: doc and file gone, song.keys updated');

  step = 'deleteArrangement of the last handmade with a generated left is FAILED_PRECONDITION';
  result = await callFunction('deleteArrangement', admin, { songId: songA, key: 'C' });
  expectStatus(result, 'FAILED_PRECONDITION', 'deleteArrangement last handmade');
  if ((await docStatus(admin, `songs/${songA}/arrangements/C`)) !== 200) fail('C doc vanished');
  if ((await fileStatus(admin, a.C)) !== 200) fail('C file vanished');
  log('deleteArrangement last handmade with generated -> FAILED_PRECONDITION');

  step = 'deleteArrangement of the last handmade works once no generated is left';
  result = await callFunction('deleteArrangement', admin, { songId: songA, key: 'E' });
  expectOk(result, 'deleteArrangement E');
  result = await callFunction('deleteArrangement', admin, { songId: songA, key: 'C' });
  expectOk(result, 'deleteArrangement C');
  await expectGone(admin, `songs/${songA}/arrangements/C`, a.C, 'delete last handmade C');
  await expectGone(admin, `songs/${songA}/arrangements/E`, a.E, 'delete generated E');
  await waitForSong(admin, { keys: [], handmadeKeys: [] }, 'after delete all', songA);
  log('deleteArrangement last handmade without generated -> ok');

  step = 'deleteSong removes the song, its arrangements and files';
  result = await callFunction('deleteSong', admin, { songId: songB });
  expectOk(result, 'deleteSong');
  if ((await docStatus(admin, `songs/${songB}`)) !== 404) fail('song B doc still exists');
  await expectGone(admin, `songs/${songB}/arrangements/C`, b.C, 'deleteSong C');
  await expectGone(admin, `songs/${songB}/arrangements/D`, b.D, 'deleteSong D');
  log('deleteSong: song doc, arrangement docs and files gone');

  step = 'deleting a handmade source while another handmade remains';
  const songC = `${songId}c`;
  const c = await seedSong(admin, adminSdk, adminUid, songC, [
    ['C', 'handmade', null],
    ['G', 'handmade', null],
    ['D', 'generated', 'C'],
  ]);
  await waitForSong(admin, { keys: ['C', 'D', 'G'], handmadeKeys: ['C', 'G'] }, 'seed C', songC);
  result = await callFunction('deleteArrangement', admin, { songId: songC, key: 'C' });
  expectOk(result, 'deleteArrangement handmade C with G left');
  await expectGone(admin, `songs/${songC}/arrangements/C`, c.C, 'delete handmade C');
  await waitForSong(admin, { keys: ['D', 'G'], handmadeKeys: ['G'] }, 'after delete C', songC);
  log('deleteArrangement handmade C while G remains -> ok, keys [D,G], handmadeKeys [G]');

  step = 'generated E derived from the remaining handmade G';
  const ePath = `songs/${songC}/E-file${runId}.pdf`;
  let response = await uploadFile(adminSdk, ePath, adminUid);
  if (!response.ok) fail(`upload E: ${response.status} ${response.error?.message}`);
  response = await commit(admin, [
    arrangementWrite(adminUid, 'E', 'E', ePath, 'generated', 'G', songC),
  ]);
  if (!response.ok) fail(`commit E from G: ${response.status} ${await response.text()}`);
  await waitForSong(admin, { keys: ['D', 'E', 'G'], handmadeKeys: ['G'] }, 'generated E', songC);
  log('generated E from handmade G after deleting C -> OK');
}

try {
  await main();
  console.log('OK');
} catch (error) {
  console.error(`FAIL at step "${step}": ${error.message}`);
  process.exit(1);
}
