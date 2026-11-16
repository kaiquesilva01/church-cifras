import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { useMatch, useSearchParams } from 'react-router';
import { applySetlistOp, SetlistFullError } from './ops';
import { SetlistGoneError, type SetlistApi } from './setlistApi';
import { hasChanges, initialSync, isRemoved, syncReducer, type SyncEvent } from './sync';
import type { Setlist, SetlistOp } from './types';
import { ActiveSetlistContext, type ActiveSetlist } from './useActiveSetlist';

/** Mesmo padrão de `validId` nas Security Rules. */
const VALID_ID = /^[A-Za-z0-9_-]{1,100}$/;

type EditResult = Awaited<ReturnType<ActiveSetlist['edit']>>;

interface Store {
  id: string | null;
  sync: typeof initialSync;
  failed: boolean;
}

type StoreEvent =
  | { type: 'fail'; id: string }
  | { type: 'reset'; id: string | null }
  | { type: 'event'; id: string; event: SyncEvent };

/** Eventos de um repertório antigo (assinatura ou edição tardia) são ignorados. */
function storeReducer(store: Store, action: StoreEvent): Store {
  if (action.type === 'reset') return { id: action.id, sync: initialSync, failed: false };
  if (action.id !== store.id) return store;
  if (action.type === 'fail') return { ...store, failed: true };
  return {
    ...store,
    failed: action.event.type === 'snapshot' ? false : store.failed,
    sync: syncReducer(store.sync, action.event),
  };
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

  const [store, dispatchStore] = useReducer(storeReducer, { id, sync: initialSync, failed: false });
  if (store.id !== id) dispatchStore({ type: 'reset', id });
  const state = store.id === id ? store.sync : initialSync;
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const validId = id !== null && VALID_ID.test(id);

  useEffect(() => {
    if (!id || !validId) return;
    try {
      return api.subscribeSetlist(
        id,
        (snap) => {
          dispatchStore({ type: 'event', id, event: { type: 'snapshot', snap } });
        },
        () => dispatchStore({ type: 'fail', id }),
      );
    } catch {
      // A API pode lançar de forma síncrona (caminho de documento inválido).
      dispatchStore({ type: 'fail', id });
    }
  }, [api, id, validId]);

  const accept = useCallback(() => {
    if (id) dispatchStore({ type: 'event', id, event: { type: 'accept' } });
  }, [id]);

  // Edições em voo: `shown` = base (sem as pendentes) + operações pendentes, na ordem.
  const baseRef = useRef<Setlist | null>(null);
  const pendingRef = useRef<SetlistOp[]>([]);
  const activeIdRef = useRef(id);
  useEffect(() => {
    activeIdRef.current = id;
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
        if (activeIdRef.current !== id) return result.changed ? 'ok' : 'noop';
        settle();
        baseRef.current = result.setlist;
        send({ type: 'adopt', setlist: result.setlist });
        const rest = pendingRef.current.length > 0 ? rebuild() : null;
        if (rest) send({ type: 'optimistic', setlist: rest });
        return result.changed ? 'ok' : 'noop';
      } catch (error) {
        if (activeIdRef.current !== id) {
          if (error instanceof SetlistGoneError) return 'gone';
          return error instanceof SetlistFullError ? 'full' : 'error';
        }
        settle();
        const restored = rebuild();
        if (restored) send({ type: 'optimistic', setlist: restored });
        if (error instanceof SetlistGoneError) return 'gone';
        return error instanceof SetlistFullError ? 'full' : 'error';
      }
    },
    [api, id],
  );

  const status: ActiveSetlist['status'] = !validId
    ? 'not-found'
    : state.phase === 'loading' && store.id === id && store.failed
      ? 'error'
      : state.phase;

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
