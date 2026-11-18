import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PadProvider } from './PadProvider';
import type { PadEngine } from './padEngine';
import type { PadNote } from './padNotes';
import type { PadOwner } from './padRoute';
import { usePad } from './usePad';

type Deferred<T> = { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void };
function deferred<T = void>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => act(async () => {});

interface FakeEngine extends PadEngine {
  start: ReturnType<typeof vi.fn<(n: PadNote) => Promise<void>>>;
  crossfadeTo: ReturnType<typeof vi.fn<(n: PadNote) => Promise<void>>>;
  stop: ReturnType<typeof vi.fn<() => void>>;
  setVolume: ReturnType<typeof vi.fn<(v: number) => void>>;
  dispose: ReturnType<typeof vi.fn<() => void>>;
}

function makeEngine(): FakeEngine {
  let note: PadNote | null = null;
  const engine = {
    start: vi.fn(async (n: PadNote) => {
      note = n;
    }),
    crossfadeTo: vi.fn(async (n: PadNote) => {
      note = n;
    }),
    stop: vi.fn(() => {
      note = null;
    }),
    setVolume: vi.fn(),
    dispose: vi.fn(),
    get note() {
      return note;
    },
  };
  return engine as unknown as FakeEngine;
}

const song: PadOwner = { kind: 'song', songId: 's1' };
const setlist: PadOwner = { kind: 'setlist', setlistId: 'r1' };

function memoryStorage(initial?: string) {
  return {
    getItem: vi.fn((k: string) =>
      k === 'cifras.pad.volume' && initial !== undefined ? initial : null,
    ),
    setItem: vi.fn(),
  };
}

interface Setup {
  engine?: FakeEngine;
  path?: string;
  storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  fetchBytes?: (p: string) => Promise<Uint8Array>;
  createEngine?: (f: unknown, g: () => void) => Promise<PadEngine>;
}

function setup(opts: Setup = {}) {
  const engine = opts.engine ?? makeEngine();
  let giveUp: () => void = () => {};
  const createEngine = vi.fn(
    opts.createEngine ??
      ((_f: unknown, g: () => void) => {
        giveUp = g;
        return Promise.resolve(engine as PadEngine);
      }),
  );
  const fetchBytes = opts.fetchBytes ?? vi.fn(() => Promise.resolve(new Uint8Array()));
  const navRef: { current: (to: string) => void } = { current: () => {} };
  function Nav() {
    navRef.current = useNavigate();
    return null;
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[opts.path ?? '/musicas/s1']}>
      <Nav />
      <PadProvider
        fetchBytes={fetchBytes}
        createEngine={createEngine as never}
        storage={opts.storage ?? memoryStorage()}
      >
        {children}
      </PadProvider>
    </MemoryRouter>
  );
  const hook = renderHook(() => usePad()!, { wrapper });
  return {
    engine,
    createEngine,
    fetchBytes,
    giveUp: () => giveUp(),
    navigate: (to: string) => act(() => navRef.current(to)),
    ...hook,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PadProvider', () => {
  describe('initial state', () => {
    it('is off with default volume and creates no engine', () => {
      const { result, createEngine } = setup();
      expect(result.current.status).toBe('off');
      expect(result.current.volume).toBe(0.6);
      expect(createEngine).not.toHaveBeenCalled();
    });

    it('restores a saved volume', () => {
      expect(setup({ storage: memoryStorage('0.3') }).result.current.volume).toBe(0.3);
    });

    it.each(['abc', '2', '-1', ''])('falls back to 0.6 for %j', (v) => {
      expect(setup({ storage: memoryStorage(v) }).result.current.volume).toBe(0.6);
    });

    it('falls back to 0.6 when storage throws', () => {
      const storage = {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      };
      const { result } = setup({ storage });
      expect(result.current.volume).toBe(0.6);
      act(() => result.current.setVolume(0.2));
      expect(result.current.volume).toBe(0.2);
    });
  });

  describe('toggle', () => {
    it('goes loading then playing and stops on the next toggle', async () => {
      const { result, engine } = setup();
      const d = deferred();
      engine.start.mockImplementationOnce(() => d.promise);
      act(() => result.current.toggle('Am', song));
      await flush();
      expect(result.current.status).toBe('loading');
      expect(engine.start).toHaveBeenCalledWith('A');
      await act(async () => d.resolve());
      expect(result.current.status).toBe('playing');
      expect(result.current.note).toBe('A');
      expect(result.current.owner).toEqual(song);
      act(() => result.current.toggle('Am', song));
      expect(engine.stop).toHaveBeenCalled();
      expect(result.current.status).toBe('off');
    });

    it('cancels while loading and ignores the late start', async () => {
      const { result, engine } = setup();
      const d = deferred();
      engine.start.mockImplementationOnce(() => d.promise);
      act(() => result.current.toggle('C', song));
      await flush();
      act(() => result.current.toggle('C', song));
      expect(result.current.status).toBe('off');
      expect(engine.stop).toHaveBeenCalled();
      await act(async () => d.resolve());
      expect(result.current.status).toBe('off');
    });

    it('disposes the engine and never starts when cancelled before it is created', async () => {
      const engine = makeEngine();
      const created = deferred<PadEngine>();
      const { result, createEngine } = setup({ createEngine: () => created.promise });
      act(() => result.current.toggle('C', song));
      expect(createEngine).toHaveBeenCalledTimes(1);
      act(() => result.current.toggle('C', song));
      expect(result.current.status).toBe('off');
      await act(async () => created.resolve(engine));
      expect(engine.dispose).toHaveBeenCalledTimes(1);
      expect(engine.start).not.toHaveBeenCalled();
      expect(result.current.status).toBe('off');
    });

    it('goes to error when start fails and retries on the next toggle', async () => {
      const { result, engine } = setup();
      engine.start.mockRejectedValueOnce(new Error('boom'));
      act(() => result.current.toggle('C', song));
      await flush();
      expect(result.current.status).toBe('error');
      expect(result.current.note).toBeNull();
      act(() => result.current.toggle('C', song));
      await flush();
      expect(result.current.status).toBe('playing');
      expect(engine.start).toHaveBeenCalledTimes(2);
    });

    it('goes to error when the engine cannot be created', async () => {
      const { result } = setup({ createEngine: () => Promise.reject(new Error('no audio')) });
      act(() => result.current.toggle('C', song));
      await flush();
      expect(result.current.status).toBe('error');
    });
  });

  describe('follow', () => {
    async function playing(key: 'C' | 'D' = 'C') {
      const s = setup();
      act(() => s.result.current.toggle(key, song));
      await flush();
      return s;
    }

    it('crossfades to a different note', async () => {
      const { result, engine } = await playing('C');
      act(() => result.current.follow('D'));
      await flush();
      expect(engine.crossfadeTo).toHaveBeenCalledWith('D');
      expect(result.current.note).toBe('D');
    });

    it('does nothing for the same tonic, null or when off', async () => {
      const { result, engine } = await playing('D');
      act(() => result.current.follow('Dm'));
      act(() => result.current.follow(null));
      expect(engine.crossfadeTo).not.toHaveBeenCalled();
      const off = setup();
      act(() => off.result.current.follow('D'));
      await flush();
      expect(off.engine.crossfadeTo).not.toHaveBeenCalled();
      expect(off.createEngine).not.toHaveBeenCalled();
    });

    it('keeps playing the old note and shows a notice when the crossfade fails', async () => {
      const { result, engine } = await playing('C');
      engine.crossfadeTo.mockRejectedValueOnce(new Error('load'));
      act(() => result.current.follow('D'));
      await flush();
      expect(result.current.status).toBe('playing');
      expect(result.current.note).toBe('C');
      expect(result.current.notice).toBe('Não foi possível trocar o tom do pad.');
      act(() => result.current.follow('E'));
      await flush();
      expect(result.current.notice).toBeNull();
      expect(result.current.note).toBe('E');
    });

    it('clears the notice on stop', async () => {
      const { result, engine } = await playing('C');
      engine.crossfadeTo.mockRejectedValueOnce(new Error('load'));
      act(() => result.current.follow('D'));
      await flush();
      expect(result.current.notice).not.toBeNull();
      act(() => result.current.toggle('C', song));
      expect(result.current.notice).toBeNull();
    });

    it('crossfades after loading when the key changed meanwhile', async () => {
      const { result, engine } = setup();
      const d = deferred();
      engine.start.mockImplementationOnce(() => d.promise);
      act(() => result.current.toggle('C', song));
      await flush();
      act(() => result.current.follow('E'));
      expect(engine.crossfadeTo).not.toHaveBeenCalled();
      await act(async () => d.resolve());
      expect(engine.crossfadeTo).toHaveBeenCalledWith('E');
      expect(result.current.status).toBe('playing');
      expect(result.current.note).toBe('E');
    });

    it('does not crossfade after loading when the desired note is the same', async () => {
      const { result, engine } = setup();
      const d = deferred();
      engine.start.mockImplementationOnce(() => d.promise);
      act(() => result.current.toggle('C', song));
      await flush();
      act(() => result.current.follow('Cm'));
      await act(async () => d.resolve());
      expect(engine.crossfadeTo).not.toHaveBeenCalled();
    });
  });

  describe('route rules', () => {
    it('stops a song pad when leaving the song, stays on the same song', async () => {
      const { result, engine, navigate } = setup({ path: '/musicas/s1' });
      act(() => result.current.toggle('C', song));
      await flush();
      await navigate('/musicas/s1?tom=d');
      expect(engine.stop).not.toHaveBeenCalled();
      await navigate('/');
      expect(engine.stop).toHaveBeenCalled();
      expect(result.current.status).toBe('off');
    });

    it('keeps a setlist pad across songs and the setlist page, stops elsewhere', async () => {
      const { result, engine, navigate } = setup({ path: '/musicas/s2?repertorio=r1&item=i2' });
      act(() => result.current.toggle('C', setlist));
      await flush();
      await navigate('/repertorios/r1');
      await navigate('/musicas/s2?repertorio=r1&item=i2');
      expect(engine.stop).not.toHaveBeenCalled();
      await navigate('/musicas/s2');
      expect(engine.stop).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('off');
    });

    it('stops a setlist pad when going home', async () => {
      const { result, engine, navigate } = setup({ path: '/repertorios/r1' });
      act(() => result.current.toggle('C', setlist));
      await flush();
      await navigate('/');
      expect(engine.stop).toHaveBeenCalled();
    });

    it('stops while loading when the route leaves the owner', async () => {
      const { result, engine, navigate } = setup({ path: '/musicas/s1' });
      const d = deferred();
      engine.start.mockImplementationOnce(() => d.promise);
      act(() => result.current.toggle('C', song));
      await flush();
      await navigate('/');
      expect(result.current.status).toBe('off');
      await act(async () => d.resolve());
      expect(result.current.status).toBe('off');
    });
  });

  describe('volume and prefetch', () => {
    it('applies and stores the volume', async () => {
      const storage = memoryStorage();
      const { result, engine } = setup({ storage });
      act(() => result.current.toggle('C', song));
      await flush();
      act(() => result.current.setVolume(0.3));
      expect(engine.setVolume).toHaveBeenCalledWith(0.3);
      expect(storage.setItem).toHaveBeenCalledWith('cifras.pad.volume', '0.3');
      expect(result.current.volume).toBe(0.3);
    });

    it('prefetches distinct notes without creating an engine or AudioContext', async () => {
      const ctor = vi.fn();
      vi.stubGlobal('AudioContext', ctor);
      const { result, fetchBytes, createEngine } = setup();
      act(() => result.current.prefetch(['C', 'Dm', 'C']));
      await flush();
      await flush();
      expect(fetchBytes).toHaveBeenCalledTimes(2);
      expect(createEngine).not.toHaveBeenCalled();
      expect(ctor).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('disposes the engine on unmount while playing', async () => {
      const { result, engine, unmount } = setup();
      act(() => result.current.toggle('C', song));
      await flush();
      unmount();
      expect(engine.dispose).toHaveBeenCalledTimes(1);
    });

    it('goes off when the engine gives up', async () => {
      const { result, giveUp } = setup();
      act(() => result.current.toggle('C', song));
      await flush();
      expect(result.current.status).toBe('playing');
      act(() => giveUp());
      expect(result.current.status).toBe('off');
      expect(result.current.note).toBeNull();
    });
  });

  describe('default engine factory (iOS)', () => {
    it('constructs the AudioContext and calls resume() synchronously inside the tap', () => {
      const calls: string[] = [];
      class FakeCtx {
        constructor() {
          calls.push('new');
        }
        resume() {
          calls.push('resume');
          return Promise.resolve();
        }
      }
      vi.stubGlobal('AudioContext', FakeCtx);
      const wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter>
          <PadProvider
            fetchBytes={() => Promise.resolve(new Uint8Array())}
            storage={memoryStorage()}
          >
            {children}
          </PadProvider>
        </MemoryRouter>
      );
      const { result } = renderHook(() => usePad()!, { wrapper });
      act(() => result.current.toggle('C', song));
      expect(calls).toEqual(['new', 'resume']);
    });
  });

  it('usePad returns null outside the provider', () => {
    const { result } = renderHook(() => usePad());
    expect(result.current).toBeNull();
  });
});
