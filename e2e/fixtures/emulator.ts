import { readFileSync } from 'node:fs';
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
  heading?: string;
  headingEndX?: number;
  /** Number of PDF pages (default 1). */
  pages?: number;
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
      heading: entry.heading,
      headingEndX: entry.headingEndX,
      pages: entry.pages,
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

const DAY_MS = 86_400_000;
const saoPaulo = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today (YYYY-MM-DD) in America/Sao_Paulo, the way the app computes it. */
export const todayInSaoPaulo = (): string => saoPaulo.format(new Date());

/** `date` (YYYY-MM-DD) shifted by `days`. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

const ts = (date: Date) => ({ timestampValue: date.toISOString() });

/**
 * Creates a setlist (Firestore REST, bypassing the rules) and returns its document id. `expiresAt`
 * defaults to what the app computes: end of `date` in America/Sao_Paulo + 30 days.
 */
export async function seedSetlist(
  date: string,
  label: string,
  items: Array<{ songId: string; key: string }>,
  opts: { expiresAt?: Date; id?: string } = {},
): Promise<string> {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const expiresAt = opts.expiresAt ?? new Date(Date.UTC(y, m - 1, d + 1, 3) + 30 * DAY_MS);
  const now = new Date();
  const fields = {
    date: str(date),
    label: str(label),
    items: {
      arrayValue: {
        values: items.map((item) => ({
          mapValue: {
            fields: {
              id: str(crypto.randomUUID()),
              songId: str(item.songId),
              key: str(item.key),
            },
          },
        })),
      },
    },
    expiresAt: ts(expiresAt),
    createdBy: str('e2e'),
    createdAt: ts(now),
    updatedBy: str('e2e'),
    updatedAt: ts(now),
  };
  const query = opts.id ? `?documentId=${encodeURIComponent(opts.id)}` : '';
  const response = await ok(
    await fetch(`${DOCS}/setlists${query}`, {
      method: 'POST',
      headers: { ...OWNER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }),
    `seed setlist ${label}`,
  );
  const { name } = (await response.json()) as { name: string };
  return name.slice(name.lastIndexOf('/') + 1);
}

/** Deletes every setlist, so the "next culto" card and the tab only hold what the test seeds. */
export async function clearSetlists(): Promise<void> {
  let pageToken: string | undefined;
  do {
    const query = `pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const response = await ok(
      await fetch(`${DOCS}/setlists?${query}`, { headers: OWNER }),
      'list setlists',
    );
    const body = (await response.json()) as {
      documents?: Array<{ name: string }>;
      nextPageToken?: string;
    };
    for (const document of body.documents ?? []) {
      await ok(
        await fetch(`http://localhost:8080/v1/${document.name}`, {
          method: 'DELETE',
          headers: OWNER,
        }),
        `delete ${document.name}`,
      );
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
}

/** Mono 16-bit PCM WAV of a quiet sine, generated in code (no audio files in the repo). */
function syntheticWav(seconds = 2, sampleRate = 8000, frequency = 220): Uint8Array<ArrayBuffer> {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(
      Math.round(2000 * Math.sin((2 * Math.PI * frequency * i) / sampleRate)),
      44 + i * 2,
    );
  }
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return bytes;
}

/**
 * Uploads the 12 pad loops listed in the app manifest to the Storage emulator. The objects carry a
 * synthetic WAV under the .m4a names: Chromium in Playwright cannot decode AAC, and
 * decodeAudioData sniffs the content, not the extension.
 */
export async function seedPads(): Promise<void> {
  const manifest = JSON.parse(
    readFileSync(new URL('../../apps/web/src/pad/padManifest.json', import.meta.url), 'utf8'),
  ) as { version: string; files: Record<string, { file: string }> };
  const wav = syntheticWav();
  for (const { file } of Object.values(manifest.files)) {
    const path = `pads/${manifest.version}/${file}.m4a`;
    await ok(
      await fetch(
        `${STORAGE}/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`,
        {
          method: 'POST',
          headers: { ...OWNER, 'Content-Type': 'audio/wav' },
          body: wav,
        },
      ),
      `upload ${path}`,
    );
  }
}
