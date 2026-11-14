import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import { ArtistPage } from './ArtistPage';

function renderArtist(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/cantores/${id}`]}>
      <Routes>
        <Route path="/cantores/:artistId" element={<ArtistPage api={fakeCatalogApi()} />} />
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
    const titles = screen.getAllByRole('link', { name: /-me/ });
    expect(titles[0]).toHaveTextContent('Ressuscita-me');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrar músicas de Aline Barros…' }), {
      target: { value: 'sonda' },
    });
    expect(screen.queryByText('Ressuscita-me')).not.toBeInTheDocument();
    expect(screen.getByText('Sonda-me')).toBeInTheDocument();
  });

  it('shows not found for unknown artist', () => {
    renderArtist('nobody');
    expect(screen.getByText('Cantor não encontrado.')).toBeInTheDocument();
  });
});
