import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Link } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { fakeSetlistApi, makeSetlist } from '../test/fakeSetlistApi';
import { SetlistGoneError } from './setlistApi';
import { ActiveSetlistProvider } from './ActiveSetlistProvider';
import { useActiveSetlist, type ActiveSetlist } from './useActiveSetlist';
import type { Setlist } from './types';

const item = (id: string, songId = 's1') => ({ id, songId, key: 'C' as const });

let current: ActiveSetlist | null = null;
function Probe() {
  const active = useActiveSetlist();
  useEffect(() => {
    current = active;
  });
  return (
    <p data-testid="probe">
      {active
        ? `${active.id}|${active.status}|${active.shown?.label ?? '-'}|${String(active.hasChanges)}|${String(active.removed)}`
        : 'null'}
    </p>
  );
}

function mount(api: ReturnType<typeof fakeSetlistApi>, path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ActiveSetlistProvider api={api}>
        <Probe />
        <Link to="/musicas/s2?repertorio=r1&item=b">next</Link>
        <Link to="/">home</Link>
        <Link to="/repertorios/r2">other</Link>
      </ActiveSetlistProvider>
    </MemoryRouter>,
  );
}
const text = () => screen.getByTestId('probe').textContent;

describe('ActiveSetlistProvider', () => {
  it('is null without an active setlist', () => {
    mount(fakeSetlistApi(), '/');
    expect(text()).toBe('null');
  });

  it('reads the id from /repertorios/:id', () => {
    mount(fakeSetlistApi([makeSetlist({ id: 'r1', label: 'A' })]), '/repertorios/r1');
    expect(text()).toBe('r1|ready|A|false|false');
  });

  it('reads the id from ?repertorio=', () => {
    mount(
      fakeSetlistApi([makeSetlist({ id: 'r1', label: 'A' })]),
      '/musicas/s1?repertorio=r1&item=a',
    );
    expect(text()).toBe('r1|ready|A|false|false');
  });

  it('reports not-found', () => {
    mount(fakeSetlistApi(), '/repertorios/zz');
    expect(text()).toBe('zz|not-found|-|false|false');
  });

  it('reports error on subscription failure', () => {
    const api = fakeSetlistApi([], {
      subscribeSetlist: (_id, _cb, onError) => {
        onError(new Error('x'));
        return () => {};
      },
    });
    mount(api, '/repertorios/r1');
    expect(text()).toBe('r1|error|-|false|false');
  });

  it('keeps one subscription and shown across viewer navigation, unsubscribes on leaving', () => {
    const api = fakeSetlistApi([makeSetlist({ id: 'r1', label: 'A' })]);
    const unsub = vi.fn();
    const orig = api.subscribeSetlist;
    const spy = vi.fn((...args: Parameters<typeof orig>) => {
      const off = orig(...args);
      return () => {
        unsub();
        off();
      };
    });
    api.subscribeSetlist = spy;
    mount(api, '/musicas/s1?repertorio=r1&item=a');
    act(() => screen.getByText('next').click());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(unsub).not.toHaveBeenCalled();
    expect(text()).toBe('r1|ready|A|false|false');
    act(() => screen.getByText('home').click());
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(text()).toBe('null');
  });

  it('resets state when the id changes', () => {
    const api = fakeSetlistApi([
      makeSetlist({ id: 'r1', label: 'A' }),
      makeSetlist({ id: 'r2', label: 'B' }),
    ]);
    mount(api, '/repertorios/r1');
    act(() => screen.getByText('other').click());
    expect(text()).toBe('r2|ready|B|false|false');
  });

  describe('sync', () => {
    it('cache first, then different server snapshot: no changes, shown is server content', () => {
      let emit: (s: Setlist | null, fromCache: boolean) => void = () => {};
      const api = fakeSetlistApi([], {
        subscribeSetlist: (_id, cb) => {
          cb({ setlist: makeSetlist({ id: 'r1', label: 'Old' }), fromCache: true });
          emit = (setlist, fromCache) => cb({ setlist, fromCache });
          return () => {};
        },
      });
      mount(api, '/repertorios/r1');
      expect(text()).toBe('r1|ready|Old|false|false');
      act(() => emit(makeSetlist({ id: 'r1', label: 'Server' }), false));
      expect(text()).toBe('r1|ready|Server|false|false');
      act(() => emit(makeSetlist({ id: 'r1', label: 'Other person' }), false));
      expect(text()).toBe('r1|ready|Server|true|false');
      act(() => current?.accept());
      expect(text()).toBe('r1|ready|Other person|false|false');
    });

    it('marks removed when deleted after loading', () => {
      const api = fakeSetlistApi([makeSetlist({ id: 'r1', label: 'A' })]);
      mount(api, '/repertorios/r1');
      act(() => api.push('r1', { setlist: null, fromCache: false }));
      expect(text()).toBe('r1|ready|A|false|true');
    });
  });

  describe('edit', () => {
    it('applies optimistically, calls the api and adopts the result', async () => {
      let resolve: (v: { setlist: Setlist; changed: boolean }) => void = () => {};
      const base = makeSetlist({ id: 'r1', label: 'A', items: [item('a')] });
      const api = fakeSetlistApi([base], {
        applyOp: vi.fn(
          () =>
            new Promise<{ setlist: Setlist; changed: boolean }>((r) => {
              resolve = r;
            }),
        ),
      });
      mount(api, '/repertorios/r1');
      let result: Promise<string> = Promise.resolve('');
      act(() => {
        result = current!.edit({ type: 'add', item: item('b') });
      });
      expect(current?.shown?.items.map((i) => i.id)).toEqual(['a', 'b']);
      expect(api.applyOp).toHaveBeenCalledWith('r1', { type: 'add', item: item('b') });
      const merged = { ...base, items: [item('a'), item('b'), item('c')] };
      await act(async () => {
        resolve({ setlist: merged, changed: true });
        await result;
      });
      expect(await result).toBe('ok');
      expect(current?.shown?.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    });

    it('restores shown and returns error on failure', async () => {
      const base = makeSetlist({ id: 'r1', items: [item('a')] });
      const api = fakeSetlistApi([base], {
        applyOp: vi.fn(() => Promise.reject(new Error('net'))),
      });
      mount(api, '/repertorios/r1');
      let r = '';
      await act(async () => {
        r = await current!.edit({ type: 'add', item: item('b') });
      });
      expect(r).toBe('error');
      expect(current?.shown?.items.map((i) => i.id)).toEqual(['a']);
    });

    it('returns error when applyOp throws synchronously', async () => {
      const base = makeSetlist({ id: 'r1', items: [item('a')] });
      const api = fakeSetlistApi([base], {
        applyOp: vi.fn(() => {
          throw new Error('unauthenticated');
        }),
      });
      mount(api, '/repertorios/r1');
      let r = '';
      await act(async () => {
        r = await current!.edit({ type: 'add', item: item('b') });
      });
      expect(r).toBe('error');
      expect(current?.shown?.items.map((i) => i.id)).toEqual(['a']);
    });

    it('returns noop when nothing changed', async () => {
      const base = makeSetlist({ id: 'r1', items: [item('a')] });
      const api = fakeSetlistApi([base]);
      mount(api, '/repertorios/r1');
      let r = '';
      await act(async () => {
        r = await current!.edit({ type: 'remove', itemId: 'zzz' });
      });
      expect(r).toBe('noop');
    });

    it('returns full without a network call when the local apply overflows', async () => {
      const items = Array.from({ length: 40 }, (_, i) => item(`i${i}`));
      const api = fakeSetlistApi([makeSetlist({ id: 'r1', items })]);
      mount(api, '/repertorios/r1');
      let r = '';
      await act(async () => {
        r = await current!.edit({ type: 'add', item: item('extra') });
      });
      expect(r).toBe('full');
      expect(api.applyOp).not.toHaveBeenCalled();
      expect(current?.shown?.items).toHaveLength(40);
    });

    it('returns gone on SetlistGoneError', async () => {
      const api = fakeSetlistApi([makeSetlist({ id: 'r1', items: [item('a')] })], {
        applyOp: vi.fn(() => Promise.reject(new SetlistGoneError())),
      });
      mount(api, '/repertorios/r1');
      let r = '';
      await act(async () => {
        r = await current!.edit({ type: 'add', item: item('b') });
      });
      expect(r).toBe('gone');
      expect(current?.shown?.items.map((i) => i.id)).toEqual(['a']);
    });

    describe('overlapping edits', () => {
      type Res = { setlist: Setlist; changed: boolean };
      const setup = () => {
        const base = makeSetlist({ id: 'r1', items: [item('a')] });
        const calls: { resolve: (v: Res) => void; reject: (e: unknown) => void }[] = [];
        const api = fakeSetlistApi([base], {
          applyOp: vi.fn(
            () =>
              new Promise<Res>((resolve, reject) => {
                calls.push({ resolve, reject });
              }),
          ),
        });
        mount(api, '/repertorios/r1');
        const ids = () => current?.shown?.items.map((i) => i.id);
        return { base, calls, ids };
      };

      it('both fail: shown returns to the server content, no phantom state', async () => {
        const { calls, ids } = setup();
        let p1: Promise<string> = Promise.resolve('');
        let p2: Promise<string> = Promise.resolve('');
        act(() => {
          p1 = current!.edit({ type: 'add', item: item('b') });
          p2 = current!.edit({ type: 'add', item: item('c') });
        });
        expect(ids()).toEqual(['a', 'b', 'c']);
        await act(async () => {
          calls[0]!.reject(new Error('net'));
          await p1;
        });
        expect(ids()).toEqual(['a', 'c']);
        await act(async () => {
          calls[1]!.reject(new Error('net'));
          await p2;
        });
        expect(await p1).toBe('error');
        expect(await p2).toBe('error');
        expect(ids()).toEqual(['a']);
        expect(current?.hasChanges).toBe(false);
      });

      it('first succeeds while second is pending: second change is kept', async () => {
        const { base, calls, ids } = setup();
        let p1: Promise<string> = Promise.resolve('');
        act(() => {
          p1 = current!.edit({ type: 'add', item: item('b') });
          void current!.edit({ type: 'add', item: item('c') });
        });
        await act(async () => {
          calls[0]!.resolve({ setlist: { ...base, items: [item('a'), item('b')] }, changed: true });
          await p1;
        });
        expect(await p1).toBe('ok');
        expect(ids()).toEqual(['a', 'b', 'c']);
      });

      it('first fails, second succeeds: shown is the server result of the second', async () => {
        const { base, calls, ids } = setup();
        let p1: Promise<string> = Promise.resolve('');
        let p2: Promise<string> = Promise.resolve('');
        act(() => {
          p1 = current!.edit({ type: 'add', item: item('b') });
          p2 = current!.edit({ type: 'add', item: item('c') });
        });
        await act(async () => {
          calls[0]!.reject(new Error('net'));
          await p1;
        });
        await act(async () => {
          calls[1]!.resolve({ setlist: { ...base, items: [item('a'), item('c')] }, changed: true });
          await p2;
        });
        expect(await p2).toBe('ok');
        expect(ids()).toEqual(['a', 'c']);
        expect(current?.hasChanges).toBe(false);
      });
    });
  });
});
