import { keyFromSlug, keySlug, type KeyName } from '@cifras/chords';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSongsContext } from '../catalog/SongsProvider';
import { itemHref, navigateItems, type ItemNav } from '../setlists/navigation';
import type { SetlistItem } from '../setlists/types';
import { useActiveSetlist } from '../setlists/useActiveSetlist';

/** `/musicas/:id?tom=…`, mantendo `repertorio`/`item` quando há contexto de repertório. */
export function viewerUrl(songId: string, key: KeyName, extraQuery: string): string {
  return `/musicas/${songId}?tom=${keySlug(key)}${extraQuery ? `&${extraQuery}` : ''}`;
}

export interface ViewerSetlist {
  /** `repertorio=…&item=…` ou vazio fora de um repertório. */
  extraQuery: string;
  /** Para onde o "‹" do cabeçalho leva. */
  backHref: string;
  /** Sem repertório na URL e com entrada anterior no app: o "‹" volta pelo histórico (`navigate(-1)`). */
  backInApp: boolean;
  /** `null` fora de um repertório (ou antes de ele carregar): sem barra. */
  nav: ItemNav | null;
  /** Item seguinte (para o pré-carregamento). */
  next: SetlistItem | null;
  go: (item: SetlistItem) => void;
  /** Tom do repertório, se o músico se desviou dele. */
  reminderKey: KeyName | null;
  missingKey: { wanted: KeyName; opened: KeyName } | null;
  banner: { type: 'removed' } | { type: 'changes'; message?: string; accept: () => void } | null;
}

interface Params {
  songId: string;
  setlistId: string | null;
  itemId: string | null;
  tomSlug: string | null;
  arrStatus: string;
  arrangementKeys: KeyName[];
  selectedKey: KeyName | null;
}

export function useViewerSetlist({
  songId,
  setlistId,
  itemId,
  tomSlug,
  arrStatus,
  arrangementKeys,
  selectedKey,
}: Params): ViewerSetlist {
  const active = useActiveSetlist();
  const { songs } = useSongsContext();
  const navigate = useNavigate();
  const location = useLocation();
  // O id que chega à API é o do provedor (validado); da URL só sai o que volta para a URL.
  const inSetlist = setlistId !== null && active !== null && active.id === setlistId;
  const shown = inSetlist ? active.shown : null;
  const extraQuery = inSetlist
    ? `repertorio=${encodeURIComponent(setlistId)}${itemId ? `&item=${encodeURIComponent(itemId)}` : ''}`
    : '';

  const nav = useMemo(
    () => (shown ? navigateItems(shown.items, songs, itemId) : null),
    [shown, songs, itemId],
  );
  const item = shown?.items.find((i) => i.id === itemId) ?? null;
  const keyExists = item !== null && arrangementKeys.includes(item.key);

  const missingKey =
    item &&
    !keyExists &&
    arrStatus === 'ready' &&
    selectedKey &&
    keyFromSlug(tomSlug ?? '') !== selectedKey
      ? { wanted: item.key, opened: selectedKey }
      : null;
  const reminderKey =
    item && keyExists && selectedKey && selectedKey !== item.key ? item.key : null;

  let banner: ViewerSetlist['banner'] = null;
  if (inSetlist && active.removed) banner = { type: 'removed' };
  else if (inSetlist && active.hasChanges) {
    const latestKey = active.latest?.items.find((i) => i.id === itemId)?.key;
    const changedKey = item && latestKey && latestKey !== item.key ? latestKey : null;
    banner = {
      type: 'changes',
      message: changedKey ? `O tom deste louvor mudou para ${changedKey}` : undefined,
      accept: () => {
        active.accept();
        // A cifra aberta acompanha o tom novo; um desvio do músico (item igual) fica como está.
        if (changedKey) navigate(viewerUrl(songId, changedKey, extraQuery), { replace: true });
      },
    };
  }

  return {
    extraQuery,
    backHref: inSetlist ? `/repertorios/${encodeURIComponent(setlistId)}` : '/',
    // 'default' é a primeira entrada da sessão (link direto ou recarga sem histórico do app).
    backInApp: setlistId === null && location.key !== 'default',
    nav,
    next: nav?.next ?? null,
    go: (target) => navigate(itemHref(setlistId ?? '', target), { replace: true }),
    reminderKey,
    missingKey,
    banner,
  };
}
