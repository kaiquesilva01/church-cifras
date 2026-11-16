import { describe, expect, it, vi } from 'vitest';
import type { KeyName } from '@cifras/chords';
import type { ClassifiedRow } from './batch';
import { describeError, runImport } from './queue';

const mk = (id: string): ClassifiedRow =>
  ({
    id,
    fileName: id,
    title: id,
    artist: 'a',
    key: 'G' as KeyName,
    status: 'pronto',
    detail: '',
    warnings: [],
  }) as unknown as ClassifiedRow;
const group = (identity: string, ...ids: string[]) => ({ identity, rows: ids.map(mk) });

type Outcome = 'imported' | 'existing';
function deferred() {
  let resolve!: (v: Outcome) => void;
  const promise = new Promise<Outcome>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

describe('runImport', () => {
  it('runs groups with concurrency 2 and rows sequentially', async () => {
    const pending = new Map<string, ReturnType<typeof deferred>>();
    const started: string[] = [];
    const worker = (r: ClassifiedRow) => {
      started.push(r.id);
      const d = deferred();
      pending.set(r.id, d);
      return d.promise;
    };
    const progress = vi.fn();
    const done = runImport([group('A', 'a1', 'a2'), group('B', 'b1'), group('C', 'c1')], worker, {
      concurrency: 2,
      onProgress: progress,
    });
    await flush();
    expect(started).toEqual(['a1', 'b1']);
    pending.get('a1')!.resolve('imported');
    await flush();
    expect(started).toEqual(['a1', 'b1', 'a2']);
    pending.get('b1')!.resolve('existing');
    await flush();
    expect(started).toEqual(['a1', 'b1', 'a2', 'c1']);
    pending.get('a2')!.resolve('imported');
    pending.get('c1')!.resolve('imported');
    const results = await done;
    expect(results.get('b1')).toEqual({ status: 'existing' });
    expect(results.get('a2')).toEqual({ status: 'imported' });
    expect(progress).toHaveBeenLastCalledWith(4, 4);
  });

  it('continues after a row error', async () => {
    const worker = async (r: ClassifiedRow): Promise<Outcome> => {
      if (r.id === 'a1') throw new Error('falhou');
      return 'imported';
    };
    const results = await runImport([group('A', 'a1', 'a2'), group('B', 'b1')], worker, {
      concurrency: 2,
      onProgress: () => {},
    });
    expect(results.get('a1')).toEqual({ status: 'error', message: 'erro inesperado' });
    expect(results.get('a2')).toEqual({ status: 'imported' });
    expect(results.get('b1')).toEqual({ status: 'imported' });
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const started: string[] = [];
    const worker = async (r: ClassifiedRow): Promise<Outcome> => {
      started.push(r.id);
      if (r.id === 'a1') controller.abort();
      return 'imported';
    };
    const results = await runImport([group('A', 'a1', 'a2'), group('B', 'b1')], worker, {
      concurrency: 1,
      onProgress: () => {},
      signal: controller.signal,
    });
    expect(started).toEqual(['a1']);
    expect([...results.keys()]).toEqual(['a1']);
  });

  it('reports each result as soon as the row finishes', async () => {
    const seen: Array<[string, string]> = [];
    await runImport(
      [group('A', 'a1', 'a2')],
      async (r) => (r.id === 'a1' ? 'imported' : 'existing'),
      {
        concurrency: 2,
        onProgress: () => {},
        onResult: (id, result) => seen.push([id, result.status]),
      },
    );
    expect(seen).toEqual([
      ['a1', 'imported'],
      ['a2', 'existing'],
    ]);
  });
});

describe('describeError', () => {
  const coded = (code: string) => Object.assign(new Error('x'), { code });
  it('translates common codes to pt-BR', () => {
    expect(describeError(coded('permission-denied'))).toBe('sem permissão');
    expect(describeError(coded('functions/permission-denied'))).toBe('sem permissão');
    expect(describeError(coded('unavailable'))).toBe('sem conexão');
    expect(describeError(coded('auth/network-request-failed'))).toBe('sem conexão');
    expect(describeError(new TypeError('Failed to fetch'))).toBe('sem conexão');
    expect(describeError(coded('storage/unauthorized'))).toBe('falha ao enviar o arquivo');
    expect(describeError(coded('storage/retry-limit-exceeded'))).toBe('falha ao enviar o arquivo');
  });
  it('falls back to a generic message', () => {
    expect(describeError(new Error('boom'))).toBe('erro inesperado');
    expect(describeError('boom')).toBe('erro inesperado');
  });
});
