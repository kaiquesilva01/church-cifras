import { useState } from 'react';
import { MAX_TEXT, validateArtist, validateTitle } from '../catalog/songText';
import { Dialog } from './Dialog';

export interface EditSongDialogProps {
  title: string;
  artistName: string;
  busy: boolean;
  error: string | null;
  /** Existing artist names, offered as suggestions for the artist field. */
  artists?: string[];
  onSave: (value: { title: string; artistName: string }) => void;
  onCancel: () => void;
}

export function EditSongDialog({
  title: initialTitle,
  artistName: initialArtist,
  busy,
  error,
  artists = [],
  onSave,
  onCancel,
}: EditSongDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [artist, setArtist] = useState(initialArtist);
  const [attempted, setAttempted] = useState(false);
  const titleError = validateTitle(title);
  const artistError = validateArtist(artist);

  const submit = (): void => {
    setAttempted(true);
    if (titleError || artistError) return;
    onSave({ title: title.trim(), artistName: artist.trim() });
  };

  return (
    <Dialog titleId="edit-title" onClose={onCancel} busy={busy}>
      <h2 id="edit-title" className="dialog-title">
        Editar nome e cantor
      </h2>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label htmlFor="edit-song-title">Música</label>
          <input
            id="edit-song-title"
            className="input"
            maxLength={MAX_TEXT}
            value={title}
            disabled={busy}
            aria-invalid={attempted && titleError ? true : undefined}
            aria-describedby={attempted && titleError ? 'edit-song-title-err' : undefined}
            onChange={(e) => setTitle(e.target.value)}
          />
          {attempted && titleError && (
            <p id="edit-song-title-err" className="field-error">
              {titleError}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="edit-song-artist">Cantor</label>
          <input
            id="edit-song-artist"
            className="input"
            list="edit-song-artists"
            maxLength={MAX_TEXT}
            value={artist}
            disabled={busy}
            aria-invalid={attempted && artistError ? true : undefined}
            aria-describedby={attempted && artistError ? 'edit-song-artist-err' : undefined}
            onChange={(e) => setArtist(e.target.value)}
          />
          <datalist id="edit-song-artists">
            {artists.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {attempted && artistError && (
            <p id="edit-song-artist-err" className="field-error">
              {artistError}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
