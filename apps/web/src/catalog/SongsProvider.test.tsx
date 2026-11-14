import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import { SongsProvider, useSongsContext } from './SongsProvider';

function Consumer({ id }: { id: string }) {
  const { status, songs } = useSongsContext();
  return <p data-testid={id}>{`${status}:${songs.length}`}</p>;
}

describe('SongsProvider', () => {
  it('SongsProvider shares one subscription', () => {
    const subscribeSongs = vi.fn(fakeCatalogApi().subscribeSongs);
    const api = fakeCatalogApi(undefined, { subscribeSongs });
    render(
      <SongsProvider api={api}>
        <Consumer id="a" />
        <Consumer id="b" />
      </SongsProvider>,
    );
    expect(subscribeSongs).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('a')).toHaveTextContent('ready:3');
    expect(screen.getByTestId('b')).toHaveTextContent('ready:3');
  });

  it('throws without a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Consumer id="a" />)).toThrow(/SongsProvider/);
    spy.mockRestore();
  });
});
