import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeSong, sampleSongs } from '../test/fakeCatalogApi';
import { AddSongSheet } from './AddSongSheet';

const noPdf = makeSong({ id: 's9', title: 'Sem PDF', titleNormalized: 'sem pdf' });

function renderSheet(onAdd = vi.fn(), onClose = vi.fn(), present = ['s2']) {
  render(
    <AddSongSheet
      songs={[...sampleSongs, noPdf]}
      presentSongIds={new Set(present)}
      onAdd={onAdd}
      onClose={onClose}
    />,
  );
  return { onAdd, onClose };
}

describe('AddSongSheet', () => {
  it('adds on tap and stays open', () => {
    const { onAdd, onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Sonda-me/ }));
    expect(onAdd).toHaveBeenCalledWith(sampleSongs[0]);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('disables songs without a PDF', () => {
    renderSheet();
    expect(screen.getByRole('button', { name: /Sem PDF/ })).toBeDisabled();
  });

  it('badges songs already in the setlist but keeps them addable', () => {
    const { onAdd } = renderSheet();
    const btn = screen.getByRole('button', { name: /Ressuscita-me/ });
    expect(btn).toHaveTextContent('já está');
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onAdd).toHaveBeenCalledWith(sampleSongs[1]);
    expect(screen.getByRole('button', { name: /Sonda-me/ })).not.toHaveTextContent('já está');
  });

  it('filters and shows the empty message', () => {
    renderSheet();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'grande' } });
    expect(screen.queryByRole('button', { name: /Sonda-me/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Grande é o Senhor/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'xyz' } });
    expect(screen.getByText('Nada encontrado para “xyz”.')).toBeInTheDocument();
  });

  it('closes', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AddSongSheet sections (like Busca)', () => {
  const hymn = makeSong({
    id: 'h1',
    title: '15 Hino',
    titleNormalized: '15 hino',
    artistId: 'harpa',
    artistName: 'Harpa',
    keys: ['C'],
    handmadeKeys: ['C'],
  });

  function renderWithHarpa(query = '') {
    render(
      <AddSongSheet
        songs={[...sampleSongs, hymn]}
        presentSongIds={new Set()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    if (query) fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
  }

  const headings = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);

  it('shows Músicas before Harpa with the whole catalog when the search is empty', () => {
    renderWithHarpa();
    expect(headings()).toEqual(['Adicionar música', 'Músicas', 'Harpa']);
    expect(screen.queryByText(/Digite para buscar/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /15 Hino/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sonda-me/ })).toBeInTheDocument();
  });

  it('has the Tudo | Músicas | Harpa chips, Tudo pressed by default', () => {
    renderWithHarpa();
    const group = screen.getByRole('group', { name: 'Filtrar resultados' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Tudo', 'Músicas', 'Harpa']);
    expect(within(group).getByRole('button', { name: 'Tudo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('filters by chip with local state', () => {
    renderWithHarpa();
    const group = screen.getByRole('group', { name: 'Filtrar resultados' });
    fireEvent.click(within(group).getByRole('button', { name: 'Harpa' }));
    expect(headings()).toEqual(['Adicionar música', 'Harpa']);
    expect(screen.queryByRole('button', { name: /Sonda-me/ })).not.toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'Músicas' }));
    expect(headings()).toEqual(['Adicionar música', 'Músicas']);
  });

  it('matches the singer name but never shows a Cantores section', () => {
    renderWithHarpa('aline');
    expect(headings()).toEqual(['Adicionar música', 'Músicas']);
    expect(screen.getByRole('button', { name: /Sonda-me/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ressuscita-me/ })).toBeInTheDocument();
  });

  it('says there is no cifra only when the catalog is empty', () => {
    render(
      <AddSongSheet songs={[]} presentSongIds={new Set()} onAdd={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('Nenhuma cifra ainda.')).toBeInTheDocument();
  });

  it('explains an empty chip when the search is empty but the catalog is not', () => {
    render(
      <AddSongSheet
        songs={sampleSongs}
        presentSongIds={new Set()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const group = screen.getByRole('group', { name: 'Filtrar resultados' });
    fireEvent.click(within(group).getByRole('button', { name: 'Harpa' }));
    expect(screen.getByText('Nenhum hino da Harpa ainda.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma cifra ainda.')).not.toBeInTheDocument();
  });

  it('explains an empty Músicas chip when only hymns exist', () => {
    render(
      <AddSongSheet songs={[hymn]} presentSongIds={new Set()} onAdd={vi.fn()} onClose={vi.fn()} />,
    );
    const group = screen.getByRole('group', { name: 'Filtrar resultados' });
    fireEvent.click(within(group).getByRole('button', { name: 'Músicas' }));
    expect(screen.getByText('Nenhuma música ainda.')).toBeInTheDocument();
  });
});
