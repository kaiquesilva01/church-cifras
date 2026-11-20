import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeSong } from '../test/fakeCatalogApi';
import { SongList } from './SongList';

const song = makeSong({
  id: 's1',
  title: 'Bondade de Deus',
  artistName: 'Isaías Saad',
  keys: ['A', 'G', 'Bb'],
  handmadeKeys: ['G'],
});

function renderList(songs = [song]) {
  return render(
    <MemoryRouter>
      <SongList songs={songs} />
    </MemoryRouter>,
  );
}

describe('SongList', () => {
  it('shows the default key (first hand-made) in the tile and highlights it among the pills', () => {
    renderList();
    const row = screen.getByRole('link', { name: 'Bondade de Deus Isaías Saad' }).closest('li')!;
    expect(row).toHaveTextContent('TomG');
    const pills = within(row);
    expect(pills.getByRole('link', { name: 'Bondade de Deus, tom G' })).toHaveClass('is-default');
    expect(pills.getByRole('link', { name: 'Bondade de Deus, tom A' })).not.toHaveClass(
      'is-default',
    );
  });

  it('does not tell assistive tech the default pill is the current page', () => {
    renderList();
    expect(screen.getByRole('link', { name: 'Bondade de Deus, tom G' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps the whole row as one link named by title and singer', () => {
    renderList();
    expect(screen.getByRole('link', { name: 'Bondade de Deus Isaías Saad' })).toHaveAttribute(
      'href',
      '/musicas/s1',
    );
  });

  it('falls back to the first saved key, and to a dash without keys', () => {
    renderList([
      makeSong({ id: 'a', title: 'A', keys: ['D'] }),
      makeSong({ id: 'b', title: 'B', keys: [] }),
    ]);
    const rows = screen
      .getAllByRole('link', { name: /^(A|B) Artista$/ })
      .map((l) => l.closest('li'));
    expect(rows[0]).toHaveTextContent('TomD');
    expect(rows[1]).toHaveTextContent('Tom–');
  });

  it('renders the lyrics snippet with the matched words highlighted', () => {
    render(
      <MemoryRouter>
        <SongList
          songs={[song]}
          snippets={
            new Map([
              [
                's1',
                [
                  { text: 'Santo', match: true },
                  { text: 'é o Senhor', match: false },
                ],
              ],
            ])
          }
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Santo').tagName).toBe('MARK');
    expect(screen.getByText('Santo').closest('.lyric-snippet')).toHaveTextContent(
      'Santo é o Senhor',
    );
  });

  it('shows the snippet in place of the key chips', () => {
    const { container } = render(
      <MemoryRouter>
        <SongList
          songs={[song]}
          snippets={new Map([['s1', [{ text: 'Santo é o Senhor', match: false }]]])}
        />
      </MemoryRouter>,
    );
    const li = container.querySelector('li')!;
    const main = screen.getByRole('link', { name: 'Bondade de Deus Isaías Saad' });
    expect(Array.from(li.children).map((c) => c.className)).toEqual([
      main.className,
      'lyric-snippet',
    ]);
    expect(container.querySelector('.chips')).toBeNull();
  });

  it('shows no snippet when the song has none', () => {
    const { container } = renderList();
    expect(container.querySelector('.lyric-snippet')).toBeNull();
  });
});
