import { fireEvent, render, screen } from '@testing-library/react';
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
