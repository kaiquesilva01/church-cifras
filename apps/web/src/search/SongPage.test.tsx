import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import { SongPage } from './SongPage';

function renderSong(path: string, api = fakeCatalogApi()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/musicas/:songId" element={<SongPage api={api} />} />
      </Routes>
    </MemoryRouter>,
  );
  return api;
}

describe('SongPage', () => {
  it('song page selects key from query and opens pdf', async () => {
    const api = renderSong('/musicas/s1?tom=A');
    expect(screen.getByRole('heading', { name: 'Sonda-me' })).toBeInTheDocument();
    expect(screen.getByText('Aline Barros')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sonda-me, tom A' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Sonda-me, tom G' })).not.toHaveAttribute(
      'aria-current',
    );
    const open = await screen.findByRole('link', { name: 'Abrir PDF' });
    expect(api.getArrangement).toHaveBeenCalledWith('s1', 'A');
    expect(open).toHaveAttribute('href', 'https://storage.test/songs/s1/G-abc.pdf');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('defaults to the first handmade key', async () => {
    const api = renderSong('/musicas/s1');
    await screen.findByRole('link', { name: 'Abrir PDF' });
    expect(api.getArrangement).toHaveBeenCalledWith('s1', 'G');
    expect(screen.getByRole('link', { name: 'Sonda-me, tom G' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('shows the error copy when loading fails', () => {
    renderSong(
      '/musicas/s1',
      fakeCatalogApi([], {
        subscribeSongs: (_cb, onError) => {
          onError(new Error('x'));
          return () => undefined;
        },
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar as cifras.');
    expect(screen.queryByText('Música não encontrada.')).not.toBeInTheDocument();
  });

  it('shows not found for unknown song', () => {
    renderSong('/musicas/nope');
    expect(screen.getByText('Música não encontrada.')).toBeInTheDocument();
  });
});
