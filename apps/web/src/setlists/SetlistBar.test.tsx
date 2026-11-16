import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ItemNav } from './navigation';
import { SetlistBar } from './SetlistBar';
import type { SetlistItem } from './types';

const a: SetlistItem = { id: 'a', songId: 's1', key: 'G' };
const c: SetlistItem = { id: 'c', songId: 's3', key: 'D' };

const nav = (over: Partial<ItemNav>): ItemNav => ({
  position: 2,
  total: 5,
  prev: a,
  next: c,
  inList: true,
  ...over,
});

const mount = (n: ItemNav, onGo = vi.fn()) => {
  render(
    <MemoryRouter>
      <SetlistBar nav={n} onGo={onGo} backHref="/repertorios/r1" />
    </MemoryRouter>,
  );
  return onGo;
};

describe('SetlistBar', () => {
  it('shows the position and goes to the neighbours', () => {
    const onGo = mount(nav({}));
    expect(screen.getByText('2 de 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Anterior/ }));
    expect(onGo).toHaveBeenLastCalledWith(a);
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    expect(onGo).toHaveBeenLastCalledWith(c);
  });

  it('disables the buttons at the extremes', () => {
    mount(nav({ position: 1, prev: null, next: null }));
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled();
  });

  it('says the item is out of the setlist, with a way back', () => {
    mount(nav({ inList: false, position: 0, prev: null, next: null }));
    expect(screen.getByText('Fora do repertório')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao repertório' })).toHaveAttribute(
      'href',
      '/repertorios/r1',
    );
    expect(screen.queryByRole('button', { name: /Anterior/ })).toBeNull();
  });
});
