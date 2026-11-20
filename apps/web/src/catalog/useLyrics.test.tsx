import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from './catalogApi';
import { useLyrics } from './useLyrics';

function Probe({ api, enabled }: { api: CatalogApi; enabled: boolean }) {
  const { status, lyrics } = useLyrics(api, enabled);
  return (
    <p>
      {status}:{[...lyrics.keys()].join(',')}
    </p>
  );
}

function controlledApi() {
  let onLyrics: (l: Map<string, string>) => void = () => undefined;
  let onError: (e: unknown) => void = () => undefined;
  const unsubscribe = vi.fn();
  const subscribeLyrics = vi.fn((cb: typeof onLyrics, err: typeof onError) => {
    onLyrics = cb;
    onError = err;
    return unsubscribe;
  });
  const api = { subscribeLyrics } as unknown as CatalogApi;
  return {
    api,
    subscribeLyrics,
    unsubscribe,
    deliver: (l: Map<string, string>) => onLyrics(l),
    fail: (e: unknown) => onError(e),
  };
}

describe('useLyrics', () => {
  it('stays idle and does not subscribe while disabled', () => {
    const ctl = controlledApi();
    render(<Probe api={ctl.api} enabled={false} />);
    expect(screen.getByText('idle:')).toBeInTheDocument();
    expect(ctl.subscribeLyrics).not.toHaveBeenCalled();
  });

  it('goes loading then ready with the map', () => {
    const ctl = controlledApi();
    render(<Probe api={ctl.api} enabled />);
    expect(screen.getByText('loading:')).toBeInTheDocument();
    act(() => ctl.deliver(new Map([['s1', 'Sonda-me']])));
    expect(screen.getByText('ready:s1')).toBeInTheDocument();
  });

  it('goes to error on onError and keeps the last map', () => {
    const ctl = controlledApi();
    render(<Probe api={ctl.api} enabled />);
    act(() => ctl.deliver(new Map([['s1', 'Sonda-me']])));
    act(() => ctl.fail(new Error('offline')));
    expect(screen.getByText('error:s1')).toBeInTheDocument();
  });

  it('unsubscribes on unmount', () => {
    const ctl = controlledApi();
    const { unmount } = render(<Probe api={ctl.api} enabled />);
    unmount();
    expect(ctl.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes and returns to idle when enabled turns false', () => {
    const ctl = controlledApi();
    const { rerender } = render(<Probe api={ctl.api} enabled />);
    act(() => ctl.deliver(new Map([['s1', 'Sonda-me']])));
    rerender(<Probe api={ctl.api} enabled={false} />);
    expect(ctl.unsubscribe).toHaveBeenCalledTimes(1);
    expect(screen.getByText('idle:s1')).toBeInTheDocument();
  });
});
