import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeSong } from '../test/fakeCatalogApi';
import { initialsOf } from './ArtistList';
import { SongList } from './SongList';

function renderList(songs = [song]) {
  return render(
    <MemoryRouter>
      <SongList songs={songs} />
    </MemoryRouter>,
  );
}

const song = makeSong({
  id: 's1',
  title: 'Bondade de Deus',
  artistName: 'Isaías Saad',
  keys: ['A', 'G', 'Bb'],
  handmadeKeys: ['G'],
});

describe('SongList', () => {
  it('shows the default key (first hand-made) in the tile and marks it among the chips', () => {
    renderList();
    const card = document.querySelector('.song-card') as HTMLElement;
    expect(card.querySelector('.key-tile-value')).toHaveTextContent('G');
    const current = within(card).getByRole('link', { name: 'Bondade de Deus, tom G' });
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(within(card).getByRole('link', { name: 'Bondade de Deus, tom A' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps the whole row as one link named by title and singer', () => {
    renderList();
    const link = screen.getByRole('link', { name: 'Bondade de Deus Isaías Saad' });
    expect(link).toHaveAttribute('href', '/musicas/s1');
  });

  it('falls back to the first saved key, and to a dash without keys', () => {
    renderList([
      makeSong({ id: 'a', title: 'A', keys: ['D'] }),
      makeSong({ id: 'b', title: 'B', keys: [] }),
    ]);
    const tiles = [...document.querySelectorAll('.key-tile-value')].map((el) => el.textContent);
    expect(tiles).toEqual(['D', '–']);
  });
});

describe('initialsOf', () => {
  it('takes up to two initials', () => {
    expect(initialsOf('Gabriela Rocha')).toBe('GR');
    expect(initialsOf('Casa Worship Brasil')).toBe('CW');
    expect(initialsOf('adhemar')).toBe('A');
    expect(initialsOf('  ')).toBe('');
  });
});
