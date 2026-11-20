// Preenche `songLyrics/{songId}` das músicas enviadas antes da busca por letra, a partir do PDF
// do arranjo feito à mão. Só cria documentos que não existem; rodar de novo não grava nada.
// As dependências (Firestore, Storage, pdf.js) ficam fora daqui: ver backfillCli.ts.

export const MAX_LYRICS_LENGTH = 20_000;
export const DEFAULT_SAMPLES = 3;
/** De quantas em quantas músicas `onProgress` é chamado (além da chamada final). */
export const PROGRESS_EVERY = 25;

export interface BackfillDeps {
  listSongIds(): Promise<string[]>;
  hasLyrics(songId: string): Promise<boolean>;
  handmadeStoragePath(songId: string): Promise<string | null>;
  readPdf(storagePath: string): Promise<Uint8Array>;
  lyricsFromPdf(pdf: Uint8Array): Promise<string>;
  writeLyrics(songId: string, text: string): Promise<boolean>; // create-only; false se já existe
}

export interface BackfillReport {
  written: number;
  existing: number;
  noPdf: string[];
  noText: string[];
  failed: Array<{ songId: string; error: string }>;
  samples: Array<{ songId: string; text: string }>;
}

export async function backfillLyrics(
  deps: BackfillDeps,
  options: {
    dryRun: boolean;
    samples?: number;
    /** Chamado a cada `PROGRESS_EVERY` músicas processadas e ao final. */
    onProgress?: (done: number, total: number) => void;
  },
): Promise<BackfillReport> {
  const sampleLimit = options.samples ?? DEFAULT_SAMPLES;
  const report: BackfillReport = {
    written: 0,
    existing: 0,
    noPdf: [],
    noText: [],
    failed: [],
    samples: [],
  };

  // Sequencial de propósito: uma música por vez, sem estourar cotas do Firestore/Storage.
  const songIds = await deps.listSongIds();
  let done = 0;
  for (const songId of songIds) {
    try {
      if (await deps.hasLyrics(songId)) {
        report.existing++;
        continue;
      }
      const storagePath = await deps.handmadeStoragePath(songId);
      if (storagePath === null) {
        report.noPdf.push(songId);
        continue;
      }
      const text = (await deps.lyricsFromPdf(await deps.readPdf(storagePath)))
        .trim()
        .slice(0, MAX_LYRICS_LENGTH);
      if (text === '') {
        report.noText.push(songId);
        continue;
      }
      const created = options.dryRun ? true : await deps.writeLyrics(songId, text);
      if (created) {
        report.written++;
        if (report.samples.length < sampleLimit) report.samples.push({ songId, text });
      } else {
        report.existing++;
      }
    } catch (error) {
      report.failed.push({
        songId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      done++;
      if (done % PROGRESS_EVERY === 0 && done !== songIds.length) {
        options.onProgress?.(done, songIds.length);
      }
    }
  }
  options.onProgress?.(done, songIds.length);
  return report;
}
