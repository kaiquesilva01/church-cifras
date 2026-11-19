import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeStatsApi } from '../test/fakeStatsApi';
import type { StatsApi } from './statsApi';
import { StatsPage } from './StatsPage';

const FOOTNOTE =
  'Uma música conta quando entra em um repertório que já fechou, isto é, depois do dia seguinte ao culto. Contada uma vez por repertório.';

function renderPage(api: StatsApi) {
  return render(
    <MemoryRouter>
      <StatsPage api={api} />
    </MemoryRouter>,
  );
}

describe('StatsPage', () => {
  it('shows loading, then the title, the back link, the counts and the storage', async () => {
    renderPage(
      fakeStatsApi({
        songCount: 300,
        pdfCount: 248,
        handmadeCount: 176,
        generatedCount: 72,
        storageBytes: 65430938,
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Estatísticas' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '‹ Voltar' })).toHaveAttribute('href', '/mais');
    expect(screen.getByRole('link', { name: '‹ Voltar' })).toHaveClass('back');
    expect(screen.getByText('248')).toBeInTheDocument();
    expect(screen.getByText('176 à mão · 72 gerados')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('62,4 MB')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the all-time ranking by default, as an ordered list with singular and plural counts', async () => {
    renderPage(
      fakeStatsApi({
        topAllTime: [
          { songId: 's1', title: 'Sonda-me', artistName: 'Aline Barros', uses: 38 },
          { songId: 's2', title: 'Grande é o Senhor', artistName: 'Adhemar de Campos', uses: 1 },
        ],
      }),
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Cifras mais usadas' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Todo o período' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Últimos 30 dias' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Sonda-me');
    expect(items[0]).toHaveTextContent('Aline Barros');
    expect(items[0]).toHaveTextContent('38 usos');
    expect(items[1]).toHaveTextContent('Grande é o Senhor');
    expect(items[1]).toHaveTextContent('1 uso');
    expect(items[1]).not.toHaveTextContent('1 usos');
  });

  it('switches to the last 30 days ranking and marks the active segment', async () => {
    renderPage(fakeStatsApi());
    await screen.findByRole('heading', { level: 1, name: 'Estatísticas' });
    expect(screen.getByRole('link', { name: /Sonda-me/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Últimos 30 dias' }));
    expect(screen.getByRole('button', { name: 'Últimos 30 dias' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Todo o período' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('link', { name: /Sonda-me/ })).not.toBeInTheDocument();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Grande é o Senhor');
    expect(items[0]).toHaveTextContent('4 usos');
  });

  it('links each ranking item to the song page', async () => {
    renderPage(fakeStatsApi());
    expect(await screen.findByRole('link', { name: /Sonda-me/ })).toHaveAttribute(
      'href',
      '/musicas/s1',
    );
    expect(screen.getByRole('link', { name: /Grande é o Senhor/ })).toHaveAttribute(
      'href',
      '/musicas/s2',
    );
  });

  it('shows the empty ranking message and keeps the counting note visible', async () => {
    renderPage(fakeStatsApi({ topAllTime: [], topLast30Days: [] }));
    expect(await screen.findByText('Ainda não há repertórios fechados.')).toBeInTheDocument();
    expect(screen.getByText(FOOTNOTE)).toBeVisible();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows an alert when the stats cannot be loaded', async () => {
    renderPage({ getStats: () => Promise.reject(new Error('x')) });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as estatísticas.',
    );
  });
});
