export type NavTab = 'musicas' | 'repertorio' | 'busca' | 'pad' | 'mais';

export interface NavTabItem {
  id: NavTab;
  label: string;
  to: string;
}

export const NAV_TABS: readonly NavTabItem[] = [
  { id: 'musicas', label: 'Músicas', to: '/' },
  { id: 'repertorio', label: 'Repertório', to: '/?aba=repertorios' },
  { id: 'busca', label: 'Busca', to: '/busca' },
  { id: 'pad', label: 'Pad', to: '/pad' },
  { id: 'mais', label: 'Mais', to: '/mais' },
];

/** The bar's tabs; Repertório only when `showRepertorio` (a ministry, or still loading it). */
export function visibleNavTabs(showRepertorio: boolean): readonly NavTabItem[] {
  return NAV_TABS.filter((tab) => tab.id !== 'repertorio' || showRepertorio);
}

/**
 * Which tab is selected on this location, or null when the bottom bar is hidden. The bar only
 * shows on the five root screens; the cifra, a setlist, the forms and the singer page are
 * full-screen details with their own back link. With Repertório hidden, `?aba=repertorios`
 * falls back to Músicas, the same as the home screen.
 */
export function activeNavTab(
  pathname: string,
  search: string,
  showRepertorio: boolean,
): NavTab | null {
  if (pathname === '/') {
    const repertorios = new URLSearchParams(search).get('aba') === 'repertorios';
    return repertorios && showRepertorio ? 'repertorio' : 'musicas';
  }
  if (pathname === '/busca') return 'busca';
  if (pathname === '/pad') return 'pad';
  if (pathname === '/mais') return 'mais';
  return null;
}
