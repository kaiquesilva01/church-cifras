import { useState } from 'react';
import { SearchInput } from '../../ui/SearchInput';
import { initialsOf } from '../../ui/initials';
import { normalizeForSearch } from '../normalize';
import type { MinistriesApi, MinistryItem } from '../ministriesApi';
import { EntryConfirm } from './EntryConfirm';

export type Catalog = { status: 'loading' | 'ready' | 'error'; list: MinistryItem[] };

const SKELETON_WIDTHS = [
  { title: 120, line: 72 },
  { title: 96, line: 64 },
  { title: 136, line: 80 },
] as const;

/** Esqueleto da tela 50 (carregando): três linhas de esqueleto dentro do cartão de lista. */
export function EntryListSkeleton() {
  return (
    <div className="entry-card" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando…
      </span>
      {SKELETON_WIDTHS.map((w, i) => (
        <div key={i} className="entry-row" aria-hidden="true">
          <span className="skeleton skeleton-tile" />
          <span className="entry-row-text">
            <span className="skeleton skeleton-title" style={{ width: w.title }} />
            <span className="skeleton skeleton-line" style={{ width: w.line }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Caixa informativa da tela 50 ("Removido do ministério"), usada na escolha e no pedido enviado. */
export function RemovedNotice({ ministryName }: { ministryName: string }) {
  return (
    <div className="entry-notice">
      <p className="entry-notice-title">Você não faz mais parte de {ministryName}.</p>
      <p className="entry-alert-text">Escolha um ministério para continuar.</p>
    </div>
  );
}

/** Tela 34 (escolha) com as caixas de 37 (recusado) e de 50 (removido). Quem lê o catálogo é a EntryPage. */
export function EntryChoose({
  api,
  catalog,
  onRetry,
  firstName,
  rejectedId,
  removedFrom,
  email,
  onExit,
  exitFailed,
}: {
  api: MinistriesApi;
  catalog: Catalog;
  onRetry: () => void;
  firstName?: string;
  rejectedId: string | null;
  removedFrom: string | null;
  email: string;
  onExit: () => void;
  exitFailed: boolean;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<MinistryItem | null>(null);

  const needle = normalizeForSearch(query);
  const shown = catalog.list.filter((m) =>
    normalizeForSearch(`${m.name} ${m.city}`).includes(needle),
  );
  // Sem o catálogo carregado o nome é desconhecido: a caixa usa o texto genérico (inferido).
  const rejectedName = rejectedId
    ? (catalog.list.find((m) => m.id === rejectedId)?.name ?? 'o ministério')
    : null;

  return (
    <main className="entry-screen">
      <header className="entry-head">
        {firstName && <p className="eyebrow">Olá, {firstName}</p>}
        <h1 className="screen-title">Escolha seu ministério</h1>
        <p className="entry-text">
          Peça para entrar no ministério em que você toca. Um admin dele precisa aprovar.
        </p>
      </header>

      {rejectedId && (
        <div className="entry-alert" role="alert">
          <div className="entry-alert-body">
            <p className="entry-alert-title">Seu pedido para {rejectedName} não foi aprovado.</p>
            <p className="entry-alert-text">
              Você pode pedir de novo ou escolher outro ministério.
            </p>
          </div>
        </div>
      )}

      {removedFrom && <RemovedNotice ministryName={removedFrom} />}

      <SearchInput
        value={query}
        onChange={setQuery}
        aria-label="Buscar ministério"
        placeholder="Buscar ministério…"
      />

      {catalog.status === 'loading' && <EntryListSkeleton />}

      {catalog.status === 'error' && (
        <div className="error-box">
          <span>Não foi possível carregar os ministérios. Tente de novo.</span>
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Tentar de novo
          </button>
        </div>
      )}

      {catalog.status === 'ready' && shown.length === 0 && (
        <div className="empty-card empty-card--search">
          <p className="empty-card-title">Nenhum ministério encontrado</p>
          <p className="empty-card-text">
            Confira o nome ou peça ao admin da app para criar o seu ministério.
          </p>
        </div>
      )}

      {catalog.status === 'ready' && shown.length > 0 && (
        <div className="entry-card">
          {shown.map((m) => (
            <button
              key={m.id}
              type="button"
              className="entry-row"
              aria-label={`Pedir para entrar em ${m.name}, ${m.city}`}
              onClick={() => setPicked(m)}
            >
              <span className="min-tile" aria-hidden="true">
                {initialsOf(m.name)}
              </span>
              <span className="entry-row-text">
                <span className="entry-row-name">{m.name}</span>
                <span className="entry-row-city">{m.city}</span>
              </span>
              <span className="entry-row-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      )}

      <footer className="entry-footer">
        <div className="entry-footer-account">
          <span className="section-eyebrow">Conta</span>
          <span className="entry-footer-email">{email}</span>
        </div>
        <button type="button" className="btn entry-exit" onClick={onExit}>
          Sair
        </button>
      </footer>
      {exitFailed && (
        <p role="alert" className="error-box">
          Não foi possível sair. Tente de novo.
        </p>
      )}

      {picked && <EntryConfirm api={api} ministry={picked} onClose={() => setPicked(null)} />}
    </main>
  );
}
