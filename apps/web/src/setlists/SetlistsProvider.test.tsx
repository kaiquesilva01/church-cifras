import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeSetlistApi, makeSetlist } from '../test/fakeSetlistApi';
import { SetlistsProvider, useSetlistsContext } from './SetlistsProvider';

function Probe() {
  const { status, setlists } = useSetlistsContext();
  return (
    <p>
      {status}:{setlists.map((s) => s.id).join(',')}
    </p>
  );
}

describe('SetlistsProvider', () => {
  it('subscribes once and exposes the list', () => {
    const api = fakeSetlistApi([makeSetlist({ id: 'r1' })]);
    const spy = vi.spyOn(api, 'subscribeSetlists');
    const { rerender } = render(
      <SetlistsProvider api={api}>
        <Probe />
        <Probe />
      </SetlistsProvider>,
    );
    expect(screen.getAllByText('ready:r1')).toHaveLength(2);
    rerender(
      <SetlistsProvider api={api}>
        <Probe />
        <Probe />
      </SetlistsProvider>,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => api.pushList([makeSetlist({ id: 'r1' }), makeSetlist({ id: 'r2' })]));
    expect(screen.getAllByText('ready:r1,r2')).toHaveLength(2);
  });

  it('starts loading until the first snapshot', () => {
    const api = fakeSetlistApi([], { subscribeSetlists: () => () => {} });
    render(
      <SetlistsProvider api={api}>
        <Probe />
      </SetlistsProvider>,
    );
    expect(screen.getByText('loading:')).toBeInTheDocument();
  });

  it('reports error on failure', () => {
    const api = fakeSetlistApi([], {
      subscribeSetlists: (_cb, onError) => {
        onError(new Error('boom'));
        return () => {};
      },
    });
    render(
      <SetlistsProvider api={api}>
        <Probe />
      </SetlistsProvider>,
    );
    expect(screen.getByText('error:')).toBeInTheDocument();
  });

  it('throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow();
    spy.mockRestore();
  });
});
