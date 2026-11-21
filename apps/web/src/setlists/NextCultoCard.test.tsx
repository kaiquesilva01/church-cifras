import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeSetlist } from '../test/fakeSetlistApi';
import { NextCultoCard } from './NextCultoCard';
import { rehearsalInstant } from './rehearsal';

const now = new Date('2026-11-16T15:00:00Z');
const today = '2026-11-16';

const renderCard = (setlists = [makeSetlist({ id: 'a', date: '2026-11-22', label: 'Domingo' })]) =>
  render(
    <MemoryRouter>
      <NextCultoCard setlists={setlists} today={today} now={now} />
    </MemoryRouter>,
  );

const item = (n: number) => ({ id: `i${n}`, songId: `s${n}`, key: 'C' as const });

describe('NextCultoCard', () => {
  it('renders nothing without an upcoming setlist', () => {
    const { container } = renderCard([makeSetlist({ id: 'a', date: '2026-11-10' })]);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every setlist of the next date as links', () => {
    renderCard([
      makeSetlist({
        id: 'a',
        date: '2026-11-22',
        label: 'Domingo',
        items: [item(1), item(2), item(3), item(4), item(5)],
      }),
      makeSetlist({ id: 'b', date: '2026-11-22', label: 'Domingo noite', items: [item(1)] }),
      makeSetlist({ id: 'c', date: '2026-11-29', label: 'Domingo' }),
    ]);
    expect(screen.getByText('Próximo culto')).toBeInTheDocument();
    const first = screen.getByRole('link', { name: /Domingo · 22\/11/ });
    expect(first).toHaveAttribute('href', '/repertorios/a');
    expect(first).toHaveTextContent('5 louvores');
    const second = screen.getByRole('link', { name: /Domingo noite · 22\/11/ });
    expect(second).toHaveAttribute('href', '/repertorios/b');
    expect(second).toHaveTextContent('1 louvor');
    expect(second).not.toHaveTextContent('1 louvores');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('mostra o ensaio em segunda linha muted, fora do link', () => {
    renderCard([
      makeSetlist({
        id: 'a',
        date: '2026-11-22',
        label: 'Domingo',
        rehearsalAt: rehearsalInstant('2026-11-22', '18:30'),
      }),
    ]);
    const line = screen.getByText('Ensaio dom · 22/11 às 18h30');
    expect(line.closest('.rehearsal-line')).toHaveClass('is-muted');
    expect(screen.getByRole('link', { name: /Domingo · 22\/11/ })).not.toHaveTextContent('Ensaio');
  });

  it('não mostra nada sem hora', () => {
    renderCard();
    expect(document.querySelector('.rehearsal-line')).toBeNull();
  });
});
