import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeSetlist } from '../test/fakeSetlistApi';
import { SetlistsTab } from './SetlistsTab';
import type { SongSummary } from '../catalog/types';
import type { Setlist } from './types';

const now = new Date('2026-11-16T15:00:00Z');
const today = '2026-11-16';

const renderTab = (setlists: Setlist[]) =>
  render(
    <MemoryRouter>
      <SetlistsTab setlists={setlists} today={today} now={now} />
    </MemoryRouter>,
  );

describe('SetlistsTab', () => {
  it('shows the empty message', () => {
    renderTab([]);
    expect(screen.getByText('Nenhum repertório ainda.')).toBeInTheDocument();
  });

  it('splits Próximos and Recentes and hides expired', () => {
    renderTab([
      makeSetlist({ id: 'up', date: '2026-11-22', label: 'Futuro' }),
      makeSetlist({ id: 'rec', date: '2026-11-10', label: 'Passado' }),
      makeSetlist({
        id: 'old',
        date: '2026-09-01',
        label: 'Vencido',
        expiresAt: new Date('2026-10-01T00:00:00Z'),
      }),
    ]);
    expect(screen.getByRole('heading', { name: 'Próximos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recentes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Futuro/ })).toHaveAttribute('href', '/repertorios/up');
    expect(screen.getByRole('link', { name: /Passado/ })).toHaveAttribute(
      'href',
      '/repertorios/rec',
    );
    expect(screen.queryByText(/Vencido/)).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum repertório ainda.')).not.toBeInTheDocument();
  });

  it('omits an empty section and counts songs', () => {
    renderTab([makeSetlist({ id: 'up', date: '2026-11-22', label: 'Futuro' })]);
    expect(screen.queryByRole('heading', { name: 'Recentes' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Futuro/ })).toHaveTextContent('0 louvores');
  });

  it('badges the cards and previews the first songs with their keys', () => {
    const songs = [
      {
        id: 's1',
        title: 'Bondade de Deus',
        titleNormalized: 'bondade de deus',
        artistId: 'a',
        artistName: 'A',
        keys: ['G'],
        handmadeKeys: ['G'],
      },
    ] as SongSummary[];
    render(
      <MemoryRouter>
        <SetlistsTab
          setlists={[
            makeSetlist({
              id: 'up',
              date: '2026-11-22',
              label: 'Futuro',
              items: [
                { id: 'i1', songId: 's1', key: 'G' },
                { id: 'i2', songId: 'gone', key: 'D' },
              ],
            }),
            makeSetlist({ id: 'rec', date: '2026-11-10', label: 'Passado' }),
          ]}
          today={today}
          now={now}
          songs={songs}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Próximo', { selector: '.status-pill' })).toBeInTheDocument();
    expect(screen.getByText('Realizado')).toBeInTheDocument();
    const tracks = screen.getByRole('list', { name: 'Louvores de Futuro' });
    const rows = within(tracks).getAllByRole('listitem');
    expect(within(rows[0]!).getByText('G')).toHaveClass('key-tag');
    expect(within(rows[0]!).getByText('Bondade de Deus')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Música removida')).toBeInTheDocument();
  });

  it('summarises long setlists after four songs', () => {
    const items = Array.from({ length: 6 }, (_, n) => ({
      id: `i${n}`,
      songId: 's',
      key: 'C' as const,
    }));
    render(
      <MemoryRouter>
        <SetlistsTab
          setlists={[makeSetlist({ id: 'up', date: '2026-11-22', label: 'Cheio', items })]}
          today={today}
          now={now}
          songs={[]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('list', { name: 'Louvores de Cheio' })).toHaveTextContent('+ 2');
  });

  it('only badges the soonest date as Próximo', () => {
    renderTab([
      makeSetlist({ id: 'a', date: '2026-11-22', label: 'Primeiro' }),
      makeSetlist({ id: 'b', date: '2026-11-29', label: 'Segundo' }),
    ]);
    const pills = [...document.querySelectorAll('.status-pill')].map((el) => el.textContent);
    expect(pills).toEqual(['Próximo', 'Agendado']);
  });

  it('strikes a key the song no longer has, like the detail page', () => {
    const songs = [
      {
        id: 's1',
        title: 'Sonda-me',
        titleNormalized: 'sonda me',
        artistId: 'a',
        artistName: 'A',
        keys: ['G'],
        handmadeKeys: ['G'],
      },
    ] as SongSummary[];
    render(
      <MemoryRouter>
        <SetlistsTab
          setlists={[
            makeSetlist({
              id: 'up',
              date: '2026-11-22',
              label: 'Futuro',
              items: [{ id: 'i1', songId: 's1', key: 'F' }],
            }),
          ]}
          today={today}
          now={now}
          songs={songs}
        />
      </MemoryRouter>,
    );
    const tag = document.querySelector('.key-tag')!;
    expect(tag.querySelector('s')).toHaveTextContent('F');
    expect(tag).toHaveTextContent('tom indisponível');
  });

  it('shows no preview while the catalog is not ready', () => {
    renderTab([
      makeSetlist({
        id: 'up',
        date: '2026-11-22',
        label: 'Futuro',
        items: [{ id: 'i1', songId: 's1', key: 'G' }],
      }),
    ]);
    expect(screen.queryByRole('list', { name: 'Louvores de Futuro' })).not.toBeInTheDocument();
    expect(screen.queryByText('Música removida')).not.toBeInTheDocument();
  });
});
