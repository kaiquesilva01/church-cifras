import { useEffect, useState } from 'react';
import { clearRemovedNotice, peekRemovedNotice } from '../../auth/removedNotice';
import { useAuth } from '../../auth/useAuth';
import type { MinistriesApi } from '../ministriesApi';
import { EntryChoose, EntryListSkeleton, type Catalog } from './EntryChoose';
import { EntrySent } from './EntrySent';

type Requests = {
  loaded: boolean;
  failed: boolean;
  pending: string | null;
  rejected: string | null;
};

/**
 * Entrada de quem não tem ministério liberado (telas 34 a 37 e o aviso de remoção da 50).
 * Lê só os pedidos da própria pessoa e o catálogo de ministérios; nunca repertório.
 */
export function EntryPage({ api }: { api: MinistriesApi }) {
  const { user, signOut } = useAuth();
  const uid = user?.uid;
  const [requests, setRequests] = useState<Requests>({
    loaded: false,
    failed: false,
    pending: null,
    rejected: null,
  });
  const [attempt, setAttempt] = useState(0);
  const [requestsAttempt, setRequestsAttempt] = useState(0);
  const [catalog, setCatalog] = useState<Catalog>({ status: 'loading', list: [] });
  // Foco no título da escolha ao montá-la: depois de cancelar o pedido ou de tentar a assinatura de
  // novo (a tela trocou). É de uso único: a escolha o zera ao focar, para uma remontagem não roubar o foco.
  const [focusTitle, setFocusTitle] = useState(false);
  // Lido no primeiro render e apagado num efeito (StrictMode: o useState repete a leitura sem apagar).
  const [removed] = useState(() => peekRemovedNotice());
  const [busy, setBusy] = useState(false);
  const [exitFailed, setExitFailed] = useState(false);

  // Só apaga depois de mostrar: a caixa aparece na escolha e no pedido enviado, que só existem com a
  // leitura de pedidos pronta (antes disso a tela é o esqueleto).
  useEffect(() => {
    if (requests.loaded && removed) clearRemovedNotice();
  }, [requests.loaded, removed]);

  useEffect(() => {
    let active = true;
    api.listMinistries().then(
      (list) => {
        if (active) setCatalog({ status: 'ready', list });
      },
      () => {
        if (active) setCatalog({ status: 'error', list: [] });
      },
    );
    return () => {
      active = false;
    };
  }, [api, attempt]);

  useEffect(() => {
    if (!uid) return;
    return api.subscribeMyRequests(
      uid,
      (list) => {
        setRequests({
          loaded: true,
          failed: false,
          pending: list.find((r) => r.status === 'pending')?.ministryId ?? null,
          rejected: list.find((r) => r.status === 'rejected')?.ministryId ?? null,
        });
      },
      // Falha da assinatura: a escolha mostra o erro com "Tentar de novo" (nunca fica presa).
      () => setRequests({ loaded: true, failed: true, pending: null, rejected: null }),
    );
  }, [api, uid, requestsAttempt]);

  function exit() {
    setExitFailed(false);
    signOut().catch(() => setExitFailed(true));
  }

  if (!requests.loaded && !requests.failed)
    return (
      <main className="entry-screen">
        <EntryListSkeleton />
      </main>
    );

  const pendingId = requests.pending;
  if (pendingId)
    return (
      <EntrySent
        ministries={catalog.status === 'ready' ? catalog.list : null}
        ministryId={pendingId}
        email={user?.email ?? ''}
        onCancel={async () => {
          setBusy(true);
          try {
            await api.callable.cancelRequest(pendingId);
            setFocusTitle(true);
          } finally {
            setBusy(false);
          }
        }}
        onExit={exit}
        removedFrom={removed}
        exitFailed={exitFailed}
        busy={busy}
      />
    );

  return (
    <EntryChoose
      api={api}
      catalog={catalog}
      onRetry={() => {
        setCatalog({ status: 'loading', list: [] });
        setAttempt((n) => n + 1);
      }}
      requestsFailed={requests.failed}
      onRetryRequests={() => {
        setRequests({ loaded: false, failed: false, pending: null, rejected: null });
        setRequestsAttempt((n) => n + 1);
        setFocusTitle(true);
      }}
      focusTitle={focusTitle}
      onTitleFocused={() => setFocusTitle(false)}
      firstName={user?.displayName?.split(' ')[0]}
      rejectedId={requests.rejected}
      removedFrom={removed}
      email={user?.email ?? ''}
      onExit={exit}
      exitFailed={exitFailed}
    />
  );
}
