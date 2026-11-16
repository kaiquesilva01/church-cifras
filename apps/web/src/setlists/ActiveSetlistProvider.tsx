import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMatch, useSearchParams } from 'react-router';
import { applySetlistOp, SetlistFullError } from './ops';
import { SetlistGoneError, type SetlistApi } from './setlistApi';
import { hasChanges, initialSync, isRemoved, syncReducer, type SyncEvent } from './sync';
import type { SetlistOp } from './types';
import { ActiveSetlistContext, type ActiveSetlist } from './useActiveSetlist';

type EditResult = Awaited<ReturnType<ActiveSetlist['edit']>>;

interface Store {
  id: string | null;
  sync: typeof initialSync;
}

type StoreEvent =
  { type: 'reset'; id: string | null } | { type: 'event'; id: string; event: SyncEvent };

/** Eventos de um repertório antigo (assinatura ou edição tardia) são ignorados. */
function storeReducer(store: Store, action: StoreEvent): Store {
  if (action.type === 'reset') return { id: action.id, sync: initialSync };
  if (action.id !== store.id) return store;
  return { ...store, sync: syncReducer(store.sync, action.event) };
}

/**
 * Mantém uma única assinatura do repertório aberto acima da tela do repertório e do visualizador
 * (rotas irmãs), então navegar entre cifras do repertório não reassina nem perde `shown`.
 * Trocar de repertório reinicia o estado sem remontar os filhos.
 */
export function ActiveSetlistProvider({ api, children }: { api: SetlistApi; children: ReactNode }) {
  const match = useMatch('/repertorios/:id');
  const [params] = useSearchParams();
  const id = match?.params.id ?? params.get('repertorio');

  const [store, dispatchStore] = useReducer(storeReducer, { id, sync: initialSync });
  const [failed, setFailed] = useState<string | null>(null);
  if (store.id !== id) dispatchStore({ type: 'reset', id });
  const state = store.id === id ? store.sync : initialSync;
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (!id) return;
    return api.subscribeSetlist(
      id,
      (snap) => {
        setFailed(null);
        dispatchStore({ type: 'event', id, event: { type: 'snapshot', snap } });
      },
      () => setFailed(id),
    );
  }, [api, id]);

  const accept = useCallback(() => {
    if (id) dispatchStore({ type: 'event', id, event: { type: 'accept' } });
  }, [id]);

  const edit = useCallback(
    async (op: SetlistOp): Promise<EditResult> => {
      if (!id) return 'error';
      const send = (event: SyncEvent) => dispatchStore({ type: 'event', id, event });
      const previous = stateRef.current.shown;
      let optimistic = false;
      if (previous) {
        try {
          const { items, changed } = applySetlistOp(previous.items, op);
          if (changed) {
            optimistic = true;
            send({ type: 'optimistic', setlist: { ...previous, items } });
          }
        } catch (error) {
          return error instanceof SetlistFullError ? 'full' : 'error';
        }
      }
      try {
        const result = await api.applyOp(id, op);
        send({ type: 'adopt', setlist: result.setlist });
        return result.changed ? 'ok' : 'noop';
      } catch (error) {
        if (error instanceof SetlistGoneError) return 'gone';
        if (optimistic && previous) send({ type: 'optimistic', setlist: previous });
        return error instanceof SetlistFullError ? 'full' : 'error';
      }
    },
    [api, id],
  );

  const status: ActiveSetlist['status'] =
    state.phase === 'loading' && failed === id ? 'error' : state.phase;

  const value = useMemo<ActiveSetlist | null>(
    () =>
      id
        ? {
            id,
            status,
            shown: state.shown,
            latest: state.latest,
            hasChanges: hasChanges(state),
            removed: isRemoved(state),
            accept,
            edit,
          }
        : null,
    [id, status, state, accept, edit],
  );

  return <ActiveSetlistContext.Provider value={value}>{children}</ActiveSetlistContext.Provider>;
}
