import { describe, expect, it } from 'vitest';
import { NAV_TABS, activeNavTab, visibleNavTabs } from './navTabs';

describe('activeNavTab', () => {
  it('maps the five root screens to their tab', () => {
    expect(activeNavTab('/', '', true)).toBe('musicas');
    expect(activeNavTab('/', '?aba=cantores', true)).toBe('musicas');
    expect(activeNavTab('/', '?q=graça', true)).toBe('musicas');
    expect(activeNavTab('/', '?aba=repertorios', true)).toBe('repertorio');
    expect(activeNavTab('/busca', '', true)).toBe('busca');
    expect(activeNavTab('/pad', '', true)).toBe('pad');
    expect(activeNavTab('/mais', '', true)).toBe('mais');
  });

  it('does not mark Repertório active when the tab is hidden', () => {
    expect(activeNavTab('/', '?aba=repertorios', false)).toBe('musicas');
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
      expect(activeNavTab(path, '', true)).toBeNull();
    }
  });

  it('lists the tabs in the design order', () => {
    expect(NAV_TABS.map((t) => t.label)).toEqual(['Músicas', 'Repertório', 'Busca', 'Pad', 'Mais']);
  });

  it('drops Repertório from the bar when it is hidden', () => {
    expect(visibleNavTabs(true).map((t) => t.id)).toEqual([
      'musicas',
      'repertorio',
      'busca',
      'pad',
      'mais',
    ]);
    expect(visibleNavTabs(false).map((t) => t.id)).toEqual(['musicas', 'busca', 'pad', 'mais']);
  });
});
