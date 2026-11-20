// Uso (na raiz do repo, ver docs/deploy.md):
//   npm run lyrics:backfill -- --bucket <nome-do-bucket> [--dry-run] [--samples <n>]
// Credenciais: Application Default Credentials. Com FIRESTORE_EMULATOR_HOST e
// FIREBASE_STORAGE_EMULATOR_HOST definidos, fala com os emuladores.
import { parseArgs } from 'node:util';
import { extractLyrics, findKeyIndicator, type Measure } from '@cifras/chords';
import { readTextLines } from '@cifras/pdf';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  backfillLyrics,
  DEFAULT_SAMPLES,
  type BackfillDeps,
  type BackfillReport,
} from './backfill';

// Mesma aproximação de largura usada pelo app ao ler o PDF (só para geometria).
const measure: Measure = (text, _fontName, fontSize) => text.length * 0.55 * fontSize;

const ALREADY_EXISTS = 6; // código gRPC; o Admin SDK pode devolver número ou nome

function parseCli(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      bucket: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      samples: { type: 'string' },
    },
  });
  if (!values.bucket) {
    throw new Error('Uso: npm run lyrics:backfill -- --bucket <nome> [--dry-run] [--samples <n>]');
  }
  const samples = values.samples === undefined ? DEFAULT_SAMPLES : Number(values.samples);
  if (!Number.isInteger(samples) || samples < 0) {
    throw new Error('--samples precisa ser um inteiro maior ou igual a 0');
  }
  return { bucket: values.bucket, dryRun: values['dry-run'], samples };
}

function realDeps(bucketName: string): BackfillDeps {
  // O projeto vem do ADC; sem gcloud configurado (ex.: emulador) use GOOGLE_CLOUD_PROJECT.
  const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
  initializeApp({ storageBucket: bucketName, projectId });
  const db = getFirestore();
  const bucket = getStorage().bucket();
  return {
    listSongIds: async () => (await db.collection('songs').get()).docs.map((d) => d.id),
    hasLyrics: async (songId) => (await db.doc(`songLyrics/${songId}`).get()).exists,
    handmadeStoragePath: async (songId) => {
      const snap = await db
        .collection(`songs/${songId}/arrangements`)
        .where('source', '==', 'handmade')
        .get();
      const path = snap.docs.map((d) => d.data().storagePath).find((p) => typeof p === 'string');
      return path ?? null;
    },
    readPdf: async (storagePath) => {
      const [data] = await bucket.file(storagePath).download();
      return new Uint8Array(data);
    },
    lyricsFromPdf: async (pdf) => {
      const lines = await readTextLines(pdf);
      const indicator = findKeyIndicator(lines, measure);
      return extractLyrics(lines, { indicator, measure });
    },
    writeLyrics: async (songId, text) => {
      try {
        await db.doc(`songLyrics/${songId}`).create({
          text,
          createdBy: 'backfill',
          createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code === ALREADY_EXISTS || code === 'ALREADY_EXISTS') return false;
        throw error;
      }
    },
  };
}

function printReport(report: BackfillReport, dryRun: boolean): void {
  console.log(dryRun ? '\n[dry-run] nada foi gravado.' : '\nConcluído.');
  console.log(`gravadas${dryRun ? ' (a gravar)' : ''}: ${report.written}`);
  console.log(`já existentes: ${report.existing}`);
  console.log(
    `sem PDF de arranjo feito à mão (${report.noPdf.length}): ${report.noPdf.join(', ') || '-'}`,
  );
  console.log(`sem texto extraível (${report.noText.length}): ${report.noText.join(', ') || '-'}`);
  console.log(`falhas (${report.failed.length}):`);
  for (const { songId, error } of report.failed) console.log(`  ${songId}: ${error}`);
  for (const { songId, text } of report.samples) {
    console.log(`\namostra ${songId}:`);
    for (const line of text.split('\n').slice(0, 4)) console.log(`  | ${line}`);
  }
}

async function main(): Promise<void> {
  const { bucket, dryRun, samples } = parseCli(process.argv.slice(2));
  const report = await backfillLyrics(realDeps(bucket), { dryRun, samples });
  printReport(report, dryRun);
  if (report.failed.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
