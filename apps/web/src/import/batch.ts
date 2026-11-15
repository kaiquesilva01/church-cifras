import { artistIdFromName, normalizeText, type KeyName } from '@cifras/chords';
import type { SongSummary } from '../catalog/types';
import { validateArtist, validateTitle } from '../catalog/songText';
import { decideUpload } from '../upload/decideUpload';

export interface BatchRow {
  id: string;
  fileName: string;
  file: File;
  title: string;
  artist: string;
  key: KeyName | null;
  chordCount: number;
  suspects: string[];
  ignoredChordLines: number;
  sizeOk: boolean;
  /** The PDF could not be read at all. */
  readError?: boolean;
}

/** Ordered by priority: the first matching status wins. */
export type BatchStatus =
  | 'fora do padrão'
  | 'grande demais'
  | 'falta a música'
  | 'falta o cantor'
  | 'falta o tom'
  | 'duplicado no lote'
  | 'conflito: tom feito à mão já existe'
  | 'substitui gerado'
  | 'já existe — novo tom'
  | 'pronto';

export type ClassifiedRow = BatchRow & {
  status: BatchStatus;
  detail: string;
  /** Non-blocking notes (suspect chords, ignored chord lines). */
  warnings: string[];
};

export interface BatchCatalog {
  findSong(titleNormalized: string, artistId: string): SongSummary | null;
  arrangementSource(songId: string, key: KeyName): 'handmade' | 'generated' | null;
}

export const IMPORTABLE: ReadonlySet<BatchStatus> = new Set<BatchStatus>([
  'pronto',
  'já existe — novo tom',
  'substitui gerado',
]);

export const isImportable = (row: { status: BatchStatus }): boolean => IMPORTABLE.has(row.status);

export const MAX_MB = 10;
export const MAX_BYTES = MAX_MB * 1024 * 1024;

export const identityOf = (title: string, artist: string): string =>
  `${normalizeText(title)}|${artistIdFromName(artist)}`;

function warningsOf(row: BatchRow): string[] {
  const warnings: string[] = [];
  if (row.suspects.length > 0) warnings.push(`revisar: ${row.suspects.join(', ')}`);
  if (row.ignoredChordLines > 0) {
    warnings.push(`linhas de acorde ignoradas: ${row.ignoredChordLines}`);
  }
  return warnings;
}

export function classifyRows(rows: BatchRow[], catalog: BatchCatalog): ClassifiedRow[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const warnings = warningsOf(row);
    const done = (status: BatchStatus, detail = ''): ClassifiedRow => ({
      ...row,
      status,
      detail,
      warnings,
    });

    if (row.readError) return done('fora do padrão', 'não foi possível ler o PDF');
    if (row.chordCount === 0) return done('fora do padrão', 'nenhum acorde encontrado');
    if (!row.sizeOk) return done('grande demais', `o arquivo passa de ${MAX_MB} MB`);
    const titleError = validateTitle(row.title);
    if (titleError) return done('falta a música', titleError);
    const artistError = validateArtist(row.artist);
    if (artistError) return done('falta o cantor', artistError);
    if (!row.key) return done('falta o tom', 'escolha o tom do PDF');

    const identity = `${identityOf(row.title, row.artist)}|${row.key}`;
    if (seen.has(identity)) {
      return done('duplicado no lote', 'mesma música, cantor e tom de uma linha anterior');
    }
    seen.add(identity);

    const song = catalog.findSong(normalizeText(row.title), artistIdFromName(row.artist));
    const source = song ? catalog.arrangementSource(song.id, row.key) : null;
    const decision = decideUpload(song ? { song, arrangement: source ? { source } : null } : null);
    switch (decision) {
      case 'blocked':
        return done(
          'conflito: tom feito à mão já existe',
          `já existe o tom ${row.key} feito à mão`,
        );
      case 'replace-generated':
        return done('substitui gerado', `o tom ${row.key} gerado será substituído`);
      case 'add-key':
        return done('já existe — novo tom', `a música já existe; entra o tom ${row.key}`);
      default:
        return done('pronto');
    }
  });
}

/** Groups importable rows by song, keeping first-appearance order. */
export function planImport(
  classified: ClassifiedRow[],
): Array<{ identity: string; rows: ClassifiedRow[] }> {
  const groups = new Map<string, ClassifiedRow[]>();
  for (const row of classified) {
    if (!isImportable(row)) continue;
    const identity = identityOf(row.title, row.artist);
    const list = groups.get(identity);
    if (list) list.push(row);
    else groups.set(identity, [row]);
  }
  return [...groups].map(([identity, rows]) => ({ identity, rows }));
}
