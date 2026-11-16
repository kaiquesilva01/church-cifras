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
import type { Setlist, SetlistOp } from './types';
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

  // Edições em voo: `shown` = base (sem as pendentes) + operações pendentes, na ordem.
  const baseRef = useRef<Setlist | null>(null);
  const pendingRef = useRef<SetlistOp[]>([]);
  useEffect(() => {
    pendingRef.current = [];
    baseRef.current = null;
  }, [id]);

  const edit = useCallback(
    async (op: SetlistOp): Promise<EditResult> => {
      if (!id) return 'error';
      const send = (event: SyncEvent) => dispatchStore({ type: 'event', id, event });
      const pending = pendingRef.current;
      if (pending.length === 0) baseRef.current = stateRef.current.shown;
      const rebuild = (): Setlist | null => {
        const base = baseRef.current;
        if (!base) return null;
        let items = base.items;
        for (const p of pendingRef.current) {
          try {
            items = applySetlistOp(items, p).items;
          } catch {
            // operação pendente que deixou de caber: ignora
          }
        }
        return { ...base, items };
      };
      if (baseRef.current) {
        try {
          applySetlistOp(rebuild()!.items, op);
        } catch (error) {
          return error instanceof SetlistFullError ? 'full' : 'error';
        }
      }
      pending.push(op);
      const view = rebuild();
      if (view) send({ type: 'optimistic', setlist: view });
      const settle = () => {
        const i = pendingRef.current.indexOf(op);
        if (i >= 0) pendingRef.current.splice(i, 1);
      };
      try {
        const result = await api.applyOp(id, op);
        settle();
        baseRef.current = result.setlist;
        send({ type: 'adopt', setlist: result.setlist });
        const rest = pendingRef.current.length > 0 ? rebuild() : null;
        if (rest) send({ type: 'optimistic', setlist: rest });
        return result.changed ? 'ok' : 'noop';
      } catch (error) {
        settle();
        const restored = rebuild();
        if (restored) send({ type: 'optimistic', setlist: restored });
        if (error instanceof SetlistGoneError) return 'gone';
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
