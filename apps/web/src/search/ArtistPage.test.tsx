import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import { ArtistPage } from './ArtistPage';

function renderArtist(id: string, api = fakeCatalogApi(), search = '') {
  return render(
    <MemoryRouter initialEntries={[`/cantores/${id}${search}`]}>
      <Routes>
        <Route path="/cantores/:artistId" element={<ArtistPage api={api} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ArtistPage', () => {
  it('artist page lists that artist songs and filters', () => {
    renderArtist('aline-barros');
    expect(screen.getByRole('link', { name: '‹ Aline Barros' })).toHaveAttribute(
      'href',
      '/?aba=cantores',
    );
    expect(screen.getByText('2 músicas')).toBeInTheDocument();
    expect(screen.queryByText('Grande é o Senhor')).not.toBeInTheDocument();
    const titles = screen.getAllByText(/-me/);
    expect(titles[0]).toHaveTextContent('Ressuscita-me');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrar músicas de Aline Barros…' }), {
      target: { value: 'sonda' },
    });
    expect(screen.queryByText('Ressuscita-me')).not.toBeInTheDocument();
    expect(screen.getByText('Sonda-me')).toBeInTheDocument();
  });

  it('keeps the filter in the url', () => {
    renderArtist('aline-barros', fakeCatalogApi(), '?q=sonda');
    expect(screen.getByRole('searchbox')).toHaveValue('sonda');
    expect(screen.queryByText('Ressuscita-me')).not.toBeInTheDocument();
  });

  it('shows the error copy when loading fails', () => {
    const api = fakeCatalogApi([], {
      subscribeSongs: (_cb, onError) => {
        onError(new Error('x'));
        return () => undefined;
      },
    });
    renderArtist('aline-barros', api);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar as cifras.');
    expect(screen.queryByText('Cantor não encontrado.')).not.toBeInTheDocument();
  });

  it('shows not found for unknown artist', () => {
    renderArtist('nobody');
    expect(screen.getByText('Cantor não encontrado.')).toBeInTheDocument();
  });
});
