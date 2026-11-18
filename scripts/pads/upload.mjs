// Envia os 12 loops para o Storage em pads/<arquivo>.
// Uso: node scripts/pads/upload.mjs --dir <loops> --bucket <nome>
// Credenciais: Application Default Credentials do ambiente (nunca guardadas no repo).
// Com FIREBASE_STORAGE_EMULATOR_HOST definido, envia para o emulador.
import { readdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { validatePadFiles } from './loop.mjs';

const { values } = parseArgs({ options: { dir: { type: 'string' }, bucket: { type: 'string' } } });
if (!values.dir || !values.bucket) {
  console.error('Uso: node scripts/pads/upload.mjs --dir <loops> --bucket <nome>');
  process.exit(1);
}

const names = readdirSync(values.dir)
  .filter((n) => n.endsWith('.m4a'))
  .sort();
const errors = validatePadFiles(names);
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const bucket = getStorage(initializeApp({ storageBucket: values.bucket })).bucket();
for (const name of names) {
  await bucket.upload(`${values.dir}/${name}`, {
    destination: `pads/${name}`,
    metadata: { contentType: 'audio/mp4', cacheControl: 'public, max-age=31536000, immutable' },
  });
  console.log(`pads/${name}`);
}
