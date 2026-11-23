import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { canEditSetlists } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import type { SongSummary } from '../catalog/types';
import { useSongsContext } from '../catalog/SongsProvider';
import { PadMini } from '../pad/PadMini';
import { WhatsAppIcon } from '../viewer/barIcons';
import { ConfirmDialog } from '../viewer/ConfirmDialog';
import { AddSongSheet } from './AddSongSheet';
import { copyItems, defaultKeyFor, newItemId } from './items';
import { KeyPicker } from './KeyPicker';
import { BackChevronIcon } from './icons';
import { buildShareMessage, resolveShareLines } from './shareMessage';
import { shareText } from './shareText';
import { RehearsalLine } from './RehearsalLine';
import { SetlistFormDialog, type SetlistFormValue } from './SetlistFormDialog';
import { SetlistItemRow } from './SetlistItemRow';
import { SortableItems } from './SortableItems';
import type { SetlistApi } from './setlistApi';
import type { SetlistOp } from './types';
import { useDismissable } from '../ui/useDismissable';
import { UpdateBanner } from './UpdateBanner';
import { useActiveSetlist } from './useActiveSetlist';
import { shortDate, songCount, weekdayOf } from './format';

const BACK = '/?aba=repertorios';
/** Tempo que a confirmação "Link copiado." fica na tela (computador, sem Web Share). */
const COPIED_NOTE_MS = 3000;

const RESULT_MESSAGES = {
  noop: 'Esse item já tinha sido alterado por outra pessoa.',
  full: 'O repertório está cheio (40 louvores).',
  gone: 'Este repertório foi removido.',
  error: 'Não foi possível salvar a alteração.',
} as const;

type Dialogs = 'none' | 'add' | 'edit' | 'duplicate' | 'delete';

export function SetlistPage({ api }: { api: SetlistApi }) {
  const active = useActiveSetlist();
  const { role } = useAuth();
  const { songs, status: songsStatus } = useSongsContext();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialogs>('none');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { onBlur: onMenuBlur } = useDismissable({
    open: menuOpen,
    onClose: closeMenu,
    root: menuRoot,
    trigger: menuTrigger,
  });
  const [pickingKeyOf, setPickingKeyOf] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<'copied' | 'error' | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    if (shareNote !== 'copied') return;
    const timer = window.setTimeout(() => setShareNote(null), COPIED_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [shareNote]);

  const songsById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);

  if (!active || active.status === 'not-found') {
    return (
      <section>
        <p className="status">Repertório não encontrado.</p>
        <Link to={BACK} className="back">
          Voltar aos repertórios
        </Link>
      </section>
    );
  }
  if (active.status === 'error') {
    return (
      <section>
        <p role="alert" className="error">
          Não foi possível carregar o repertório.
        </p>
        <Link to={BACK} className="back">
          Voltar aos repertórios
        </Link>
      </section>
    );
  }
  if (songsStatus === 'error') {
    // Sem o catálogo não dá para saber quais músicas existem: não mostramos a lista
    // (senão tudo apareceria como "Música removida") nem controles que dependem dela.
    return (
      <section>
        <p role="alert" className="error">
          Não foi possível carregar as músicas.
        </p>
        <Link to={BACK} className="back">
          Voltar aos repertórios
        </Link>
      </section>
    );
  }
  const { shown } = active;
  if (active.status === 'loading' || !shown || songsStatus === 'loading') {
    return (
      <p role="status" className="status">
        Carregando…
      </p>
    );
  }

  const editable = canEditSetlists(role) && !active.removed;
  const items = shown.items;
  // Edição parte do estado mais novo: um ensaio gravado em outro aparelho (ainda não aceito
  // no banner) não pode ser apagado ao salvar só o rótulo.
  const newest = active.latest ?? shown;

  const run = async (op: SetlistOp): Promise<void> => {
    setMessage(null);
    const result = await active.edit(op);
    if (result !== 'ok') setMessage(RESULT_MESSAGES[result]);
  };

  const addSong = (song: SongSummary): void => {
    const key = defaultKeyFor(song);
    if (key === null) return;
    void run({ type: 'add', item: { id: newItemId(), songId: song.id, key } });
  };

  const closeDialog = (): void => {
    setDialog('none');
    setDialogError(null);
  };

  const saveMeta = async (value: SetlistFormValue): Promise<void> => {
    setBusy(true);
    setDialogError(null);
    try {
      if (dialog === 'duplicate') {
        const id = await api.createSetlist({ ...value, items: copyItems(items) });
        navigate(`/repertorios/${id}`);
      } else {
        await api.updateSetlistMeta(active.id, value);
        // Edição própria mostra o estado confirmado (§6.4), não um aviso de mudança alheia.
        active.accept();
      }
      closeDialog();
    } catch {
      setDialogError(
        dialog === 'duplicate'
          ? 'Não foi possível duplicar o repertório.'
          : 'Não foi possível salvar o repertório.',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setDialogError(null);
    try {
      await api.deleteSetlist(active.id);
      navigate(BACK, { state: { notice: 'Repertório apagado.' } });
    } catch {
      setDialogError('Não foi possível apagar o repertório.');
      setBusy(false);
    }
  };

  const share = async (): Promise<void> => {
    setShareNote(null);
    const text = buildShareMessage({
      label: shown.label,
      date: shown.date,
      items: resolveShareLines(items, songsById),
      link: `${window.location.origin}/repertorios/${shown.id}`,
    });
    try {
      if ((await shareText(text)) === 'copied') setShareNote('copied');
    } catch {
      setShareNote('error');
    }
  };

  const pickingItem = items.find((i) => i.id === pickingKeyOf);
  const pickingSong = pickingItem ? songsById.get(pickingItem.songId) : undefined;

  return (
    <section>
      <div className="setlist-header">
        <Link to={BACK} className="back">
          <BackChevronIcon />
          Voltar
        </Link>
        {editable && (
          <div className="setlist-menu" ref={menuRoot} onBlur={onMenuBlur}>
            <button
              ref={menuTrigger}
              type="button"
              className="btn btn-icon"
              aria-label="Menu do repertório"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              ⋯
            </button>
            {menuOpen && (
              <div role="menu" className="setlist-menu-list">
                {(
                  [
                    ['edit', 'Editar data, rótulo e ensaio'],
                    ['duplicate', 'Duplicar'],
                    ['delete', 'Apagar'],
                  ] as const
                ).map(([target, label]) => (
                  <button
                    key={target}
                    type="button"
                    role="menuitem"
                    className="btn"
                    onClick={() => {
                      setMenuOpen(false);
                      setDialog(target);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="setlist-eyebrow">
        {weekdayOf(shown.date)} · {shortDate(shown.date)}
      </p>
      <h1 className="page-title">{shown.label}</h1>
      <RehearsalLine rehearsalAt={shown.rehearsalAt} now={now} clock />
      {!editable && <p className="setlist-count">{songCount(shown)}</p>}
      <PadMini setlistId={shown.id} />
      {active.removed && (
        <div role="status" className="notice">
          <p>Este repertório foi removido.</p>
          <Link to={BACK}>Voltar aos repertórios</Link>
        </div>
      )}
      {!active.removed && active.hasChanges && <UpdateBanner onAccept={active.accept} />}
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
      {items.length === 0 ? (
        <p className="status">Nenhum louvor neste repertório ainda.</p>
      ) : (
        <SortableItems
          items={items}
          editable={editable}
          titles={
            new Map(items.map((i) => [i.id, songsById.get(i.songId)?.title ?? 'Música removida']))
          }
          onMove={(itemId, afterItemId) => void run({ type: 'move', itemId, afterItemId })}
          renderRow={(item, index, drag) => (
            <SetlistItemRow
              key={item.id}
              setlistId={active.id}
              item={item}
              song={songsById.get(item.songId)}
              position={index + 1}
              editable={editable}
              onRemove={() => void run({ type: 'remove', itemId: item.id })}
              onPickKey={() => setPickingKeyOf(item.id)}
              drag={drag}
            />
          )}
        />
      )}
      {!editable && (
        <p className="setlist-readonly-note">
          Somente leitura · só admins editam o repertório
        </p>
      )}
      {editable && (
        <button type="button" className="fab setlist-fab" onClick={() => setDialog('add')}>
          ＋ Adicionar
        </button>
      )}
      {!active.removed && (
        <button
          type="button"
          className="setlist-share"
          aria-label="Compartilhar repertório"
          onClick={() => void share()}
        >
          <WhatsAppIcon />
        </button>
      )}
      <p role="status" className={shareNote === 'copied' ? 'setlist-share-note' : 'sr-only'}>
        {shareNote === 'copied' ? 'Link copiado.' : ''}
      </p>
      {shareNote === 'error' && (
        <p role="alert" className="setlist-share-note is-error">
          Não foi possível compartilhar.
        </p>
      )}
      {dialog === 'add' && (
        <AddSongSheet
          songs={songs}
          presentSongIds={new Set(items.map((i) => i.songId))}
          onAdd={addSong}
          onClose={closeDialog}
        />
      )}
      {(dialog === 'edit' || dialog === 'duplicate') && (
        <SetlistFormDialog
          mode={dialog}
          initial={
            dialog === 'edit'
              ? { date: newest.date, label: newest.label, rehearsalAt: newest.rehearsalAt }
              : undefined
          }
          busy={busy}
          error={dialogError}
          onSave={(value) => void saveMeta(value)}
          onCancel={closeDialog}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title="Apagar repertório"
          confirmLabel="Apagar repertório"
          busy={busy}
          error={dialogError}
          onConfirm={() => void remove()}
          onCancel={closeDialog}
        >
          Apagar “{shown.label}”? Essa ação não pode ser desfeita.
        </ConfirmDialog>
      )}
      {pickingItem && pickingSong && (
        <KeyPicker
          keys={pickingSong.keys}
          current={pickingItem.key}
          onPick={(key) => {
            setPickingKeyOf(null);
            void run({ type: 'setKey', itemId: pickingItem.id, key });
          }}
          onClose={() => setPickingKeyOf(null)}
        />
      )}
    </section>
  );
}
