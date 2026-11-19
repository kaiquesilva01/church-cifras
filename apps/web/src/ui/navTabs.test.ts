import { describe, expect, it } from 'vitest';
import { NAV_TABS, activeNavTab } from './navTabs';

describe('activeNavTab', () => {
  it('maps the five root screens to their tab', () => {
    expect(activeNavTab('/', '')).toBe('musicas');
    expect(activeNavTab('/', '?aba=cantores')).toBe('musicas');
    expect(activeNavTab('/', '?q=graça')).toBe('musicas');
    expect(activeNavTab('/', '?aba=repertorios')).toBe('repertorio');
    expect(activeNavTab('/busca', '')).toBe('busca');
    expect(activeNavTab('/pad', '')).toBe('pad');
    expect(activeNavTab('/mais', '')).toBe('mais');
  });

  it('hides the bar on details and forms', () => {
    for (const path of [
      '/musicas/abc',
      '/repertorios/r1',
      '/cantores/gabriela-rocha',
      '/nova',
      '/importar',
      '/pessoas',
      '/login',
    ]) {
      expect(activeNavTab(path, '')).toBeNull();
    }
  });

  it('lists the tabs in the design order', () => {
    expect(NAV_TABS.map((t) => t.label)).toEqual(['Músicas', 'Repertório', 'Busca', 'Pad', 'Mais']);
  });
});
