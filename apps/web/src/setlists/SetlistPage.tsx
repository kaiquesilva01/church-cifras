import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { canEdit } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import type { SongSummary } from '../catalog/types';
import { useSongsContext } from '../catalog/SongsProvider';
import { ConfirmDialog } from '../viewer/ConfirmDialog';
import { AddSongSheet } from './AddSongSheet';
import { copyItems, defaultKeyFor, newItemId } from './items';
import { KeyPicker } from './KeyPicker';
import { SetlistFormDialog } from './SetlistFormDialog';
import { SetlistItemRow } from './SetlistItemRow';
import { SortableItems } from './SortableItems';
import type { SetlistApi } from './setlistApi';
import type { SetlistOp } from './types';
import { UpdateBanner } from './UpdateBanner';
import { useActiveSetlist } from './useActiveSetlist';
import { shortDate } from './format';

const BACK = '/?aba=repertorios';

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
  const [pickingKeyOf, setPickingKeyOf] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

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

  const editable = canEdit(role) && !active.removed;
  const items = shown.items;

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

  const saveMeta = async (value: { date: string; label: string }): Promise<void> => {
    setBusy(true);
    setDialogError(null);
    try {
      if (dialog === 'duplicate') {
        const id = await api.createSetlist({ ...value, items: copyItems(items) });
        navigate(`/repertorios/${id}`);
      } else {
        await api.updateSetlistMeta(active.id, value);
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

  const pickingItem = items.find((i) => i.id === pickingKeyOf);
  const pickingSong = pickingItem ? songsById.get(pickingItem.songId) : undefined;

  return (
    <section>
      <div className="setlist-header">
        <Link to={BACK} className="back">
          Voltar
        </Link>
        {editable && (
          <div className="setlist-menu">
            <button
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
                    ['edit', 'Editar data e rótulo'],
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
      <h1 className="page-title">
        {shown.label} · {shortDate(shown.date)}
      </h1>
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
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onMoveUp={() =>
                void run({
                  type: 'move',
                  itemId: item.id,
                  afterItemId: items[index - 2]?.id ?? null,
                })
              }
              onMoveDown={() =>
                void run({
                  type: 'move',
                  itemId: item.id,
                  afterItemId: items[index + 1]?.id ?? null,
                })
              }
              onRemove={() => void run({ type: 'remove', itemId: item.id })}
              onPickKey={() => setPickingKeyOf(item.id)}
              drag={drag}
            />
          )}
        />
      )}
      {editable && (
        <button type="button" className="fab" onClick={() => setDialog('add')}>
          ＋ Adicionar
        </button>
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
          initial={{ date: shown.date, label: shown.label }}
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
