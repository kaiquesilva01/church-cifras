import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi, sampleSongs } from '../test/fakeCatalogApi';
import { BuscaPage } from './BuscaPage';

function renderBusca(path = '/busca') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SongsProvider api={fakeCatalogApi(sampleSongs)}>
        <BuscaPage />
      </SongsProvider>
    </MemoryRouter>,
  );
}

describe('BuscaPage', () => {
  it('asks for a search before showing anything', () => {
    renderBusca();
    expect(screen.getByRole('heading', { level: 1, name: 'Busca' })).toBeInTheDocument();
    expect(screen.getByText('Digite para buscar uma música ou um cantor.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Músicas' })).not.toBeInTheDocument();
  });

  it('shows singers and songs together for the same query', () => {
    renderBusca('/busca?q=aline');
    const singers = screen.getByRole('heading', { name: 'Cantores' }).nextElementSibling!;
    expect(within(singers as HTMLElement).getByText('Aline Barros')).toBeInTheDocument();
    const songs = screen.getByRole('heading', { name: 'Músicas' }).nextElementSibling!;
    expect(within(songs as HTMLElement).getByText('Sonda-me')).toBeInTheDocument();
    expect(within(songs as HTMLElement).getByText('Ressuscita-me')).toBeInTheDocument();
  });

  it('filters to songs only or singers only', () => {
    renderBusca('/busca?q=aline');
    fireEvent.click(screen.getByRole('button', { name: 'Músicas' }));
    expect(screen.queryByRole('heading', { name: 'Cantores' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Músicas' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cantores' }));
    expect(screen.queryByRole('heading', { name: 'Músicas' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cantores' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cantores' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('types into the url and says when nothing matches', () => {
    renderBusca();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nada encontrado para “zzz”.')).toBeInTheDocument();
  });

  it('finds songs by accent-insensitive title', () => {
    renderBusca('/busca?q=ressuscita');
    expect(screen.getByText('Ressuscita-me')).toBeInTheDocument();
    expect(screen.queryByText('Sonda-me')).not.toBeInTheDocument();
  });
});
