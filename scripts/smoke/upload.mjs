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

function uploadFile(token, path) {
  return fetch(`${STORAGE}/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${token}` },
    body: PDF,
  });
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

function songWrite(uid) {
  return {
    update: {
      name: `projects/${PROJECT}/databases/(default)/documents/songs/${songId}`,
      fields: {
        title: str(`Smoke ${runId}`),
        titleNormalized: str(`smoke ${runId}`),
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

function arrangementWrite(uid, key, slug, storagePath, source, derivedFromKey) {
  return {
    update: {
      name: `projects/${PROJECT}/databases/(default)/documents/songs/${songId}/arrangements/${slug}`,
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

async function callReplace(token, data) {
  const response = await fetch(`${FUNCTIONS}/${PROJECT}/${REGION}/replaceArrangement`, {
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
  log('admin signed in with role claim');

  step = 'sign in as viewer';
  const viewer = await signIn('viewer@cifras.local', 'smoke-viewer');

  step = 'admin uploads handmade C file';
  const cPath = `songs/${songId}/C-file${runId}c.pdf`;
  let response = await uploadFile(admin, cPath);
  if (!response.ok) fail(`upload C: ${response.status} ${await response.text()}`);

  step = 'admin commits song + handmade C';
  response = await commit(admin, [
    songWrite(adminUid),
    arrangementWrite(adminUid, 'C', 'C', cPath, 'handmade', null),
  ]);
  if (!response.ok) fail(`commit song+C: ${response.status} ${await response.text()}`);

  step = 'trigger updates song.keys for C';
  await waitForSong(admin, { keys: ['C'], handmadeKeys: ['C'] }, 'C');
  log('song.keys contains C');

  step = 'viewer commit is rejected';
  const viewerUid = claims(viewer).user_id;
  response = await commit(viewer, [
    songWrite(viewerUid),
    arrangementWrite(viewerUid, 'C', 'C', cPath, 'handmade', null),
  ]);
  if (response.status !== 403) fail(`viewer commit expected 403, got ${response.status}`);
  log('viewer commit -> 403');

  step = 'admin adds generated D with its own file';
  const dOld = `songs/${songId}/D-file${runId}d.pdf`;
  response = await uploadFile(admin, dOld);
  if (!response.ok) fail(`upload D: ${response.status} ${await response.text()}`);
  response = await commit(admin, [arrangementWrite(adminUid, 'D', 'D', dOld, 'generated', 'C')]);
  if (!response.ok) fail(`commit generated D: ${response.status} ${await response.text()}`);
  await waitForSong(admin, { keys: ['C', 'D'], handmadeKeys: ['C'] }, 'generated D');

  step = 'replaceArrangement replaces generated D';
  const dNew = `songs/${songId}/D-file${runId}n.pdf`;
  response = await uploadFile(admin, dNew);
  if (!response.ok) fail(`upload new D: ${response.status} ${await response.text()}`);
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
  response = await uploadFile(admin, dAgain);
  if (!response.ok) fail(`upload third D: ${response.status} ${await response.text()}`);
  result = await callReplace(admin, { ...call, storagePath: dAgain });
  if (result.body?.error?.status !== 'FAILED_PRECONDITION') {
    fail(`expected FAILED_PRECONDITION, got ${result.status} ${JSON.stringify(result.body)}`);
  }
  log('replace on handmade -> FAILED_PRECONDITION');
}

try {
  await main();
  console.log('OK');
} catch (error) {
  console.error(`FAIL at step "${step}": ${error.message}`);
  process.exit(1);
}
