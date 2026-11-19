import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PadProvider } from './PadProvider';
import type { PadEngine } from './padEngine';
import type { PadNote } from './padNotes';
import type { PadOwner } from './padRoute';
import { usePad } from './usePad';
import { buildPadEngine } from './padBuild';

vi.mock('./padBuild', () => ({ buildPadEngine: vi.fn() }));

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

    it('goes back to the original key mid-crossfade (C -> D -> C)', async () => {
      const { result, engine } = await playing('C');
      const d = deferred();
      engine.crossfadeTo.mockImplementationOnce(() => d.promise);
      act(() => result.current.follow('D'));
      act(() => result.current.follow('C'));
      expect(engine.crossfadeTo).toHaveBeenLastCalledWith('C');
      await act(async () => d.resolve());
      expect(result.current.note).toBe('C');
    });

    it('applies only the latest crossfade when they resolve out of order', async () => {
      const { result, engine } = await playing('C');
      const dD = deferred();
      const dE = deferred();
      engine.crossfadeTo.mockImplementationOnce(() => dD.promise);
      engine.crossfadeTo.mockImplementationOnce(() => dE.promise);
      act(() => result.current.follow('D'));
      act(() => result.current.follow('E'));
      await act(async () => dE.resolve());
      expect(result.current.note).toBe('E');
      await act(async () => dD.resolve());
      expect(result.current.note).toBe('E');
    });

    it('ignores a stale crossfade failure and reverts the target when the latest fails', async () => {
      const { result, engine } = await playing('C');
      const dD = deferred();
      engine.crossfadeTo.mockImplementationOnce(() => dD.promise);
      engine.crossfadeTo.mockRejectedValueOnce(new Error('load'));
      act(() => result.current.follow('D'));
      act(() => result.current.follow('E'));
      await flush();
      expect(result.current.notice).not.toBeNull();
      await act(async () => dD.reject(new Error('stale')));
      expect(result.current.note).toBe('C');
      act(() => result.current.follow('C'));
      expect(engine.crossfadeTo).toHaveBeenCalledTimes(2);
    });

    it('starts directly in the desired key when follow happens before the engine exists', async () => {
      const engine = makeEngine();
      const created = deferred<PadEngine>();
      const { result } = setup({ createEngine: () => created.promise });
      act(() => result.current.toggle('C', song));
      act(() => result.current.follow('E'));
      await act(async () => created.resolve(engine));
      expect(engine.start).toHaveBeenCalledTimes(1);
      expect(engine.start).toHaveBeenCalledWith('E');
      expect(engine.crossfadeTo).not.toHaveBeenCalled();
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

  describe('navigation', () => {
    it('keeps a song pad playing after leaving the song', async () => {
      const { result, engine, navigate } = setup({ path: '/musicas/s1' });
      act(() => result.current.toggle('C', song));
      await flush();
      const note = result.current.note;
      for (const to of [
        '/musicas/s1?tom=d',
        '/',
        '/busca',
        '/repertorios/r1',
        '/musicas/s2',
        '/pad',
      ]) {
        await navigate(to);
        expect(result.current.status).toBe('playing');
        expect(result.current.note).toBe(note);
      }
      expect(engine.stop).not.toHaveBeenCalled();
    });

    it('keeps a setlist pad playing after leaving the setlist', async () => {
      const { result, engine, navigate } = setup({ path: '/repertorios/r1' });
      act(() => result.current.toggle('C', setlist));
      await flush();
      const note = result.current.note;
      for (const to of ['/', '/busca', '/musicas/s2', '/musicas/s2?repertorio=r2', '/pad']) {
        await navigate(to);
        expect(result.current.status).toBe('playing');
        expect(result.current.note).toBe(note);
      }
      expect(engine.stop).not.toHaveBeenCalled();
      expect(result.current.owner).toEqual(setlist);
    });

    it('shows a pad started on a song as playing on the Pad tab after going home', async () => {
      const { result, engine, navigate } = setup({ path: '/musicas/s1' });
      act(() => result.current.toggle('C', song));
      await flush();
      const note = result.current.note;
      await navigate('/');
      expect(result.current.status).toBe('playing');
      await navigate('/pad');
      expect(result.current.status).toBe('playing');
      expect(result.current.note).toBe(note);
      expect(result.current.owner).toEqual(song);
      expect(engine.stop).not.toHaveBeenCalled();
    });

    it('keeps a pad started from the Pad tab on any route, stops only by toggle', async () => {
      const free: PadOwner = { kind: 'free' };
      const { result, engine, navigate } = setup({ path: '/pad' });
      act(() => result.current.toggle('C', free));
      await flush();
      await navigate('/musicas/s1');
      await navigate('/repertorios/r1');
      await navigate('/');
      expect(engine.stop).not.toHaveBeenCalled();
      expect(result.current.status).toBe('playing');
      act(() => result.current.toggle('C', free));
      expect(engine.stop).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('off');
    });

    it('keeps loading and ends up playing when the route changes meanwhile', async () => {
      const { result, engine, navigate } = setup({ path: '/musicas/s1' });
      const d = deferred();
      engine.start.mockImplementationOnce(() => d.promise);
      act(() => result.current.toggle('C', song));
      await flush();
      await navigate('/');
      await act(async () => d.resolve());
      expect(result.current.status).toBe('playing');
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

    it('hard-cuts the engine when it gives up and builds a fresh one next time', async () => {
      const { result, giveUp, engine, createEngine } = setup();
      act(() => result.current.toggle('C', song));
      await flush();
      expect(result.current.status).toBe('playing');
      act(() => giveUp());
      expect(result.current.status).toBe('off');
      expect(result.current.note).toBeNull();
      expect(engine.dispose).toHaveBeenCalledTimes(1);
      act(() => result.current.toggle('C', song));
      await flush();
      expect(createEngine).toHaveBeenCalledTimes(2);
      expect(result.current.status).toBe('playing');
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

    function renderDefault() {
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
      return renderHook(() => usePad()!, { wrapper });
    }
    const originalAudioSession = Object.getOwnPropertyDescriptor(navigator, 'audioSession');
    afterEach(() => {
      if (originalAudioSession)
        Object.defineProperty(navigator, 'audioSession', originalAudioSession);
      else delete (navigator as unknown as Record<string, unknown>).audioSession;
    });

    it('sets audioSession.type to playback before creating the AudioContext, with latencyHint playback', () => {
      const calls: string[] = [];
      let options: unknown;
      class FakeCtx {
        constructor(opts?: unknown) {
          options = opts;
          calls.push('new');
        }
        resume() {
          return Promise.resolve();
        }
      }
      vi.stubGlobal('AudioContext', FakeCtx);
      const session = {
        set type(v: string) {
          calls.push(`type=${v}`);
        },
      };
      Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
      const { result } = renderDefault();
      act(() => result.current.toggle('C', song));
      expect(calls).toEqual(['type=playback', 'new']);
      expect(options).toEqual({ latencyHint: 'playback' });
    });

    it('does not throw when audioSession is absent', () => {
      const calls: string[] = [];
      class FakeCtx {
        constructor() {
          calls.push('new');
        }
        resume() {
          return Promise.resolve();
        }
      }
      vi.stubGlobal('AudioContext', FakeCtx);
      delete (navigator as unknown as Record<string, unknown>).audioSession;
      const { result } = renderDefault();
      expect(() => act(() => result.current.toggle('C', song))).not.toThrow();
      expect(calls).toEqual(['new']);
    });

    it('still creates the AudioContext when the audioSession setter throws', () => {
      const calls: string[] = [];
      class FakeCtx {
        constructor() {
          calls.push('new');
        }
        resume() {
          return Promise.resolve();
        }
      }
      vi.stubGlobal('AudioContext', FakeCtx);
      const session = {
        set type(_v: string) {
          throw new Error('not allowed');
        },
      };
      Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
      const { result } = renderDefault();
      expect(() => act(() => result.current.toggle('C', song))).not.toThrow();
      expect(calls).toEqual(['new']);
    });
  });

  describe('teardown after stop', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('disposes the engine once the fade-out has finished', async () => {
      vi.useFakeTimers();
      const { result, engine } = setup();
      act(() => result.current.toggle('C', song));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => result.current.toggle('C', song));
      expect(engine.stop).toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(3400);
      });
      expect(engine.dispose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(engine.dispose).toHaveBeenCalledTimes(1);
    });

    it('a toggle inside the window reuses the live engine', async () => {
      vi.useFakeTimers();
      const { result, engine, createEngine } = setup();
      act(() => result.current.toggle('C', song));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => result.current.toggle('C', song));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      act(() => result.current.toggle('D', song));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(engine.dispose).not.toHaveBeenCalled();
      expect(createEngine).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('playing');
    });

    it('a user stop also tears down, and unmount clears the timer', async () => {
      vi.useFakeTimers();
      const { result, engine, unmount } = setup({ path: '/musicas/s1' });
      act(() => result.current.toggle('C', song));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => result.current.toggle('C', song));
      act(() => {
        vi.advanceTimersByTime(3600);
      });
      expect(engine.dispose).toHaveBeenCalledTimes(1);

      const second = setup({ path: '/musicas/s1' });
      act(() => second.result.current.toggle('C', song));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => second.result.current.toggle('C', song));
      second.unmount();
      expect(second.engine.dispose).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(second.engine.dispose).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('closes the default-factory AudioContext after the fade-out', async () => {
      vi.useFakeTimers();
      const close = vi.fn(() => Promise.resolve());
      class FakeCtx {
        resume() {
          return Promise.resolve();
        }
        close = close;
      }
      vi.stubGlobal('AudioContext', FakeCtx);
      vi.mocked(buildPadEngine).mockReturnValue(makeEngine());
      const wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={['/musicas/s1']}>
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
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => result.current.toggle('C', song));
      expect(close).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(3600);
      });
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  describe('default factory AudioContext lifecycle', () => {
    function stubCtx() {
      const close = vi.fn(() => Promise.resolve());
      class FakeCtx {
        resume() {
          return Promise.resolve();
        }
        close = close;
      }
      vi.stubGlobal('AudioContext', FakeCtx);
      return close;
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/musicas/s1']}>
        <PadProvider fetchBytes={() => Promise.resolve(new Uint8Array())} storage={memoryStorage()}>
          {children}
        </PadProvider>
      </MemoryRouter>
    );

    it('closes the context when cancelled before the engine is created', async () => {
      const close = stubCtx();
      const engine = makeEngine();
      vi.mocked(buildPadEngine).mockReturnValue(engine);
      const { result } = renderHook(() => usePad()!, { wrapper });
      act(() => result.current.toggle('C', song));
      act(() => result.current.toggle('C', song));
      await flush();
      await flush();
      expect(engine.dispose).toHaveBeenCalled();
      expect(engine.start).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('closes the context on unmount and keeps it right after a stop', async () => {
      const close = stubCtx();
      vi.mocked(buildPadEngine).mockReturnValue(makeEngine());
      const { result, unmount } = renderHook(() => usePad()!, { wrapper });
      act(() => result.current.toggle('C', song));
      await flush();
      act(() => result.current.toggle('C', song));
      expect(close).not.toHaveBeenCalled();
      unmount();
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('closes the context and reports error when building the engine fails', async () => {
      const close = stubCtx();
      vi.mocked(buildPadEngine).mockImplementation(() => {
        throw new Error('chunk');
      });
      const { result } = renderHook(() => usePad()!, { wrapper });
      act(() => result.current.toggle('C', song));
      await flush();
      await flush();
      expect(result.current.status).toBe('error');
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  describe('failed start', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    function stubCtxCounting() {
      const close = vi.fn(() => Promise.resolve());
      let created = 0;
      class FakeCtx {
        constructor() {
          created += 1;
        }
        resume() {
          return Promise.resolve();
        }
        close = close;
      }
      vi.stubGlobal('AudioContext', FakeCtx);
      return { close, created: () => created };
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/musicas/s1']}>
        <PadProvider fetchBytes={() => Promise.resolve(new Uint8Array())} storage={memoryStorage()}>
          {children}
        </PadProvider>
      </MemoryRouter>
    );
    const settle = () =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

    it('tears the engine and the context down after the window', async () => {
      vi.useFakeTimers();
      const { close } = stubCtxCounting();
      const engine = makeEngine();
      engine.start.mockRejectedValue(new Error('network'));
      vi.mocked(buildPadEngine).mockReturnValue(engine);
      const { result } = renderHook(() => usePad()!, { wrapper });
      act(() => result.current.toggle('C', song));
      await settle();
      expect(result.current.status).toBe('error');
      expect(engine.dispose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(3600);
      });
      expect(engine.dispose).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('a retry inside the window cancels the timer and works', async () => {
      vi.useFakeTimers();
      const { close } = stubCtxCounting();
      const engine = makeEngine();
      engine.start.mockRejectedValueOnce(new Error('network'));
      vi.mocked(buildPadEngine).mockReturnValue(engine);
      const { result } = renderHook(() => usePad()!, { wrapper });
      act(() => result.current.toggle('C', song));
      await settle();
      expect(result.current.status).toBe('error');
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      act(() => result.current.toggle('C', song));
      await settle();
      expect(result.current.status).toBe('playing');
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(engine.dispose).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    });

    it('a retry after the teardown builds a fresh context synchronously in the tap', async () => {
      vi.useFakeTimers();
      const { created } = stubCtxCounting();
      const first = makeEngine();
      first.start.mockRejectedValue(new Error('network'));
      vi.mocked(buildPadEngine).mockReturnValueOnce(first).mockReturnValue(makeEngine());
      const { result } = renderHook(() => usePad()!, { wrapper });
      act(() => result.current.toggle('C', song));
      await settle();
      act(() => {
        vi.advanceTimersByTime(3600);
      });
      expect(created()).toBe(1);
      act(() => result.current.toggle('C', song));
      expect(created()).toBe(2);
      await settle();
      expect(result.current.status).toBe('playing');
    });
  });

  it('usePad returns null outside the provider', () => {
    const { result } = renderHook(() => usePad());
    expect(result.current).toBeNull();
  });
});
