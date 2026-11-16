import type { ClassifiedRow } from './batch';

export type RowResult =
  { status: 'imported' } | { status: 'existing' } | { status: 'error'; message: string };

export interface RunOptions {
  concurrency: number;
  onProgress(done: number, total: number): void;
  /** Called as soon as each row finishes. */
  onResult?(rowId: string, result: RowResult): void;
  signal?: AbortSignal;
}

/** Short pt-BR reason for a failed row (raw error messages are not for the report). */
export function describeError(error: unknown): string {
  const code = String((error as { code?: unknown } | null)?.code ?? '').replace(/^functions\//, '');
  const message = error instanceof Error ? error.message : '';
  if (code === 'permission-denied') return 'sem permissão';
  if (code === 'unavailable' || /network/i.test(code) || /failed to fetch|network/i.test(message)) {
    return 'sem conexão';
  }
  if (code.startsWith('storage/')) return 'falha ao enviar o arquivo';
  return 'erro inesperado';
}

/**
 * Rows of one song run in sequence (the first creates it, the rest add keys);
 * different songs run in parallel up to `concurrency`. A failing row does not
 * stop the others. Aborting stops starting new rows; finished ones stay.
 */
export async function runImport(
  groups: Array<{ identity: string; rows: ClassifiedRow[] }>,
  worker: (row: ClassifiedRow) => Promise<'imported' | 'existing'>,
  opts: RunOptions,
): Promise<Map<string, RowResult>> {
  const results = new Map<string, RowResult>();
  const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
  let done = 0;
  let next = 0;

  async function lane(): Promise<void> {
    while (!opts.signal?.aborted && next < groups.length) {
      const group = groups[next++]!;
      for (const row of group.rows) {
        if (opts.signal?.aborted) return;
        let result: RowResult;
        try {
          result = { status: await worker(row) };
        } catch (error) {
          console.error(`Falha ao importar ${row.fileName}`, error);
          result = { status: 'error', message: describeError(error) };
        }
        results.set(row.id, result);
        opts.onResult?.(row.id, result);
        done += 1;
        opts.onProgress(done, total);
      }
    }
  }

  const lanes = Math.max(1, Math.min(opts.concurrency, groups.length));
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}
