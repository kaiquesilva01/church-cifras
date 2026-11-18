// Envia os 12 loops para o Storage em pads/<version>/<arquivo>.
//
// Uso (depois de produce.mjs --src <dir> --out fixtures/private/pads):
//   node scripts/pads/upload.mjs --dir fixtures/private/pads/loops \
//     --report fixtures/private/pads/relatorio.json --bucket <nome>
//
// Antes de enviar, confere o relatorio.json e os arquivos de --dir com
// apps/web/src/pad/padManifest.json (fonte única do app); qualquer divergência aborta (exit 1).
// (a) Se a conferência falhar porque o introBars mudou ao regenerar os loops, atualize
//     padManifest.json E suba a `version` (v1 -> v2) na mesma mudança: os arquivos são imutáveis
//     e ficam em cache por um ano nos aparelhos, então nomes/versões antigos nunca seriam relidos.
// (b) `firebase-admin` é resolvido pelo hoisting dos npm workspaces (vem de apps/functions).
// (c) Fontes e saídas nunca são commitadas; mantenha-as em fixtures/private/pads/.
// Credenciais: Application Default Credentials do ambiente (nunca guardadas no repo).
// Com FIREBASE_STORAGE_EMULATOR_HOST definido, envia para o emulador.
import { readFileSync, readdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { checkAgainstManifest, validatePadFiles } from './loop.mjs';

const { values } = parseArgs({
  options: { dir: { type: 'string' }, report: { type: 'string' }, bucket: { type: 'string' } },
});
if (!values.dir || !values.report || !values.bucket) {
  console.error(
    'Uso: node scripts/pads/upload.mjs --dir <loops> --report <relatorio.json> --bucket <nome>',
  );
  process.exit(1);
}

const manifest = JSON.parse(
  readFileSync(new URL('../../apps/web/src/pad/padManifest.json', import.meta.url), 'utf8'),
);
const { report } = JSON.parse(readFileSync(values.report, 'utf8'));

const names = readdirSync(values.dir)
  .filter((n) => n.endsWith('.m4a'))
  .sort();
const allowed = new Set(Object.values(manifest.files).map(({ file }) => `${file}.m4a`));
const errors = [
  ...validatePadFiles(names),
  ...checkAgainstManifest(Array.isArray(report) ? report : [], manifest),
  ...names.filter((n) => !allowed.has(n)).map((n) => `arquivo fora do manifesto: ${n}`),
  ...[...allowed].filter((n) => !names.includes(n)).map((n) => `arquivo ausente em --dir: ${n}`),
];
if (errors.length > 0) {
  console.error([...new Set(errors)].join('\n'));
  process.exit(1);
}

const bucket = getStorage(initializeApp({ storageBucket: values.bucket })).bucket();
for (const name of names) {
  const destination = `pads/${manifest.version}/${name}`;
  await bucket.upload(`${values.dir}/${name}`, {
    destination,
    metadata: { contentType: 'audio/mp4', cacheControl: 'public, max-age=31536000, immutable' },
  });
  console.log(destination);
}
