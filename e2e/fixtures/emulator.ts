import { syntheticPdf } from './pdf';

// Direct access to the Firebase emulators (project demo-church-cifras) to prepare test data.
// "Bearer owner" bypasses the Security Rules, so seeding does not depend on any signed-in user.
const PROJECT = 'demo-church-cifras';
const BUCKET = `${PROJECT}.appspot.com`;
const AUTH = 'http://localhost:9099';
const DOCS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const STORAGE = 'http://localhost:9199';
const OWNER = { Authorization: 'Bearer owner' };

// Same rules as @cifras/chords (normalizeText, artistIdFromName, keySlug), kept local so the E2E
// package has no build-time dependency on the app code.
const normalizeText = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const artistIdFromName = (name: string): string =>
  normalizeText(name)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
const keySlug = (key: string): string => key.replace('#', 's');

const str = (stringValue: string) => ({ stringValue });
const strings = (values: string[]) => ({
  arrayValue: values.length > 0 ? { values: values.map(str) } : {},
});

async function ok(response: Response, what: string): Promise<Response> {
  if (!response.ok) throw new Error(`${what}: ${response.status} ${await response.text()}`);
  return response;
}

export interface SeedKey {
  key: string;
  /** Defaults to handmade. */
  source?: 'handmade' | 'generated';
  derivedFromKey?: string;
  chordLines?: Array<Array<[number, string]>>;
}

export interface SeededSong {
  id: string;
  title: string;
  artist: string;
}

/** Creates a song with one synthetic PDF per key (Firestore docs and Storage objects). */
export async function seedSong(
  title: string,
  artist: string,
  keys: SeedKey[],
): Promise<SeededSong> {
  const id = `e2e-${normalizeText(title).replace(/\s+/g, '-')}-${artistIdFromName(artist)}`.slice(
    0,
    120,
  );
  const song = `projects/${PROJECT}/databases/(default)/documents/songs/${id}`;
  const writes: object[] = [
    {
      update: {
        name: song,
        fields: {
          title: str(title),
          titleNormalized: str(normalizeText(title)),
          artistId: str(artistIdFromName(artist)),
          artistName: str(artist),
          keys: strings(keys.map((k) => k.key)),
          handmadeKeys: strings(keys.filter((k) => k.source !== 'generated').map((k) => k.key)),
          createdBy: str('e2e-seed'),
        },
      },
      updateTransforms: [
        { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ],
    },
  ];
  for (const entry of keys) {
    const slug = keySlug(entry.key);
    const path = `songs/${id}/${entry.key.replace(/[^A-Za-z0-9]/g, '')}-seed.pdf`;
    const bytes = await syntheticPdf({
      title,
      artist,
      key: entry.key,
      chordLines: entry.chordLines,
    });
    await ok(
      await fetch(
        `${STORAGE}/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`,
        {
          method: 'POST',
          headers: { ...OWNER, 'Content-Type': 'application/pdf' },
          body: new Uint8Array(bytes),
        },
      ),
      `upload ${path}`,
    );
    const source = entry.source ?? 'handmade';
    writes.push({
      update: {
        name: `${song}/arrangements/${slug}`,
        fields: {
          key: str(entry.key),
          storagePath: str(path),
          source: str(source),
          derivedFromKey: entry.derivedFromKey ? str(entry.derivedFromKey) : { nullValue: null },
          writer: str(source === 'handmade' ? 'upload' : 'overlay'),
          chordCount: { integerValue: '12' },
          collisions: { integerValue: '0' },
          createdBy: str('e2e-seed'),
        },
      },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    });
  }
  await ok(
    await fetch(`${DOCS}:commit`, {
      method: 'POST',
      headers: { ...OWNER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
    }),
    `commit ${id}`,
  );
  return { id, title, artist };
}

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Registers (or signs in) a Google account in the Auth emulator without any browser. */
export async function createGoogleUser(email: string, displayName: string): Promise<string> {
  const idToken = `${b64url({ alg: 'none' })}.${b64url({
    sub: `e2e-${email}`,
    email,
    name: displayName,
    email_verified: true,
  })}.`;
  const response = await ok(
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestUri: 'http://localhost',
        returnSecureToken: true,
        postBody: `id_token=${idToken}&providerId=google.com`,
      }),
    }),
    `sign-in ${email}`,
  );
  return ((await response.json()) as { localId: string }).localId;
}

/** Waits for the onUserCreated trigger to write users/{uid} (the People page lists that collection). */
export async function waitForUserDoc(uid: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const response = await fetch(`${DOCS}/users/${uid}`, { headers: OWNER });
    if (response.ok) return;
    if (Date.now() > deadline) throw new Error(`users/${uid} never appeared (onUserCreated)`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
