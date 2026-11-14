import { KEY_OPTIONS, artistIdFromName, keySlug, normalizeText, parseKey } from '@cifras/chords';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrangementExistsError, saveUpload, type CatalogApi } from '../catalog/catalogApi';
import { deriveArtists } from '../catalog/search';
import { useSongsContext } from '../catalog/SongsProvider';
import type { UploadPlan } from '../catalog/types';
import { decideUpload, type UploadDecision } from './decideUpload';
import type { PdfSuggestion } from './readPdfSuggestion';

export type ReadPdf = (file: File, knownArtists: string[]) => Promise<PdfSuggestion>;

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT = 120;
const DEBOUNCE_MS = 300;

type PickError = 'too-big' | 'unreadable' | 'no-chords';

type FileState =
  { status: 'empty' } | { status: 'ready'; name: string; chordCount: number; suspects: string[] };

type LookupResult =
  { status: 'error' } | { status: 'done'; decision: UploadDecision; songId: string | null };
type Lookup = { status: 'idle' } | { status: 'checking' } | LookupResult;

type SaveState = 'idle' | 'saving' | 'conflict' | 'failed';

interface FromPdf {
  title: boolean;
  artist: boolean;
  key: boolean;
}

const NO_FLAGS: FromPdf = { title: false, artist: false, key: false };

function Badge({ show }: { show: boolean }) {
  return show ? <span className="badge">· lido do PDF</span> : null;
}

export function UploadPage({ api, readPdf }: { api: CatalogApi; readPdf: ReadPdf }) {
  const navigate = useNavigate();
  const { songs } = useSongsContext();
  const artists = useMemo(() => deriveArtists(songs).map((a) => a.name), [songs]);
  // Known race: if the songs finish loading after a PDF was read, the title/artist swap
  // heuristic ran with an incomplete artist list. Accepted; the swap button covers it.
  const artistsRef = useRef(artists);
  useEffect(() => {
    artistsRef.current = artists;
  }, [artists]);

  const [fileState, setFileState] = useState<FileState>({ status: 'empty' });
  const [reading, setReading] = useState(false);
  const [pickError, setPickError] = useState<PickError | null>(null);
  const keyRef = useRef<HTMLSelectElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [chordCount, setChordCount] = useState(0);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [key, setKey] = useState('');
  const [minor, setMinor] = useState(false);
  const [fromPdf, setFromPdf] = useState<FromPdf>(NO_FLAGS);
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<{ sig: string; value: LookupResult } | null>(null);
  const [recheck, setRecheck] = useState(0);
  const [save, setSave] = useState<SaveState>('idle');
  const readId = useRef(0);
  const immediate = useRef(false);

  const titleTrim = title.trim();
  const artistTrim = artist.trim();
  const NO_TEXT = 'Use letras ou números no nome.';
  const titleError = !titleTrim
    ? 'Informe o nome da música.'
    : normalizeText(titleTrim) === ''
      ? NO_TEXT
      : null;
  const artistError = !artistTrim
    ? 'Informe o cantor.'
    : normalizeText(artistTrim) === ''
      ? NO_TEXT
      : null;
  const keyError = key ? null : 'Escolha o tom.';
  const valid = !titleError && !artistError && !keyError;
  const ready = fileState.status === 'ready';

  // Identifies the inputs of the lookup; results for any other signature are stale.
  const sig = ready && valid ? JSON.stringify([titleTrim, artistTrim, key, recheck]) : null;
  const lookup: Lookup =
    sig === null ? { status: 'idle' } : result?.sig === sig ? result.value : { status: 'checking' };

  useEffect(() => {
    if (sig === null) return;
    let stale = false;
    const run = async () => {
      let value: LookupResult;
      try {
        const song = await api.findSong(normalizeText(titleTrim), artistIdFromName(artistTrim));
        const arrangement = song ? await api.getArrangement(song.id, key) : null;
        value = {
          status: 'done',
          decision: decideUpload(song ? { song, arrangement } : null),
          songId: song?.id ?? null,
        };
      } catch {
        value = { status: 'error' };
      }
      if (!stale) setResult({ sig, value });
    };
    const delay = immediate.current ? 0 : DEBOUNCE_MS;
    immediate.current = false;
    const timer = setTimeout(() => void run(), delay);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [api, sig, titleTrim, artistTrim, key]);

  const onPick = (picked: File | undefined) => {
    if (!picked) return;
    const id = ++readId.current;
    setPickError(null);
    if (picked.size > MAX_BYTES) {
      setReading(false);
      setPickError('too-big');
      return;
    }
    setReading(true);
    readPdf(picked, artistsRef.current).then(
      (result) => {
        if (id !== readId.current) return;
        setReading(false);
        if (result.chordCount < 1) {
          setPickError('no-chords');
          return;
        }
        setSave('idle');
        setAttempted(false);
        const { suggestion } = result;
        const parsed = suggestion.key ? parseKey(suggestion.key) : null;
        setFile(picked);
        setChordCount(result.chordCount);
        setTitle(suggestion.title.slice(0, MAX_TEXT));
        setArtist(suggestion.artist.slice(0, MAX_TEXT));
        setKey(parsed?.name ?? '');
        setMinor(parsed?.minor ?? false);
        setFromPdf({
          title: suggestion.title !== '',
          artist: suggestion.artist !== '',
          key: parsed !== null,
        });
        setFileState({
          status: 'ready',
          name: picked.name,
          chordCount: result.chordCount,
          suspects: [...new Set(result.suspects.flat())],
        });
      },
      () => {
        if (id !== readId.current) return;
        setReading(false);
        setPickError('unreadable');
      },
    );
  };

  const decision = lookup.status === 'done' ? lookup.decision : null;
  const keyLabel = key;
  const buttonLabel =
    decision === 'add-key'
      ? `Adicionar tom ${keyLabel}`
      : decision === 'replace-generated'
        ? `Substituir tom ${keyLabel}`
        : 'Salvar cifra';

  const retryLookup = () => {
    immediate.current = true;
    setRecheck((n) => n + 1);
  };

  const submit = async () => {
    setAttempted(true);
    if (!valid || !file || lookup.status !== 'done' || lookup.decision === 'blocked') return;
    const base = { file, key, chordCount };
    const plan: UploadPlan =
      lookup.decision === 'new-song'
        ? { ...base, action: 'new-song', title: titleTrim, artistName: artistTrim }
        : { ...base, action: lookup.decision, songId: lookup.songId! };
    setSave('saving');
    try {
      const saved = await saveUpload(api, plan);
      void navigate(`/musicas/${saved.songId}?tom=${keySlug(saved.key)}`);
    } catch (error) {
      if (error instanceof ArrangementExistsError) {
        setSave('conflict');
        retryLookup();
      } else {
        setSave('failed');
        retryLookup();
      }
    }
  };

  const picker = (label: string) => (
    <label className="btn file-pick">
      {label}
      <input
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );

  const clearSaveError = () => setSave((s) => (s === 'saving' ? s : 'idle'));

  const editKey = (value: string) => {
    clearSaveError();
    setKey(value);
    setFromPdf((f) => ({ ...f, key: false }));
  };

  const pickErrorText =
    pickError === 'too-big'
      ? 'O PDF precisa ter até 10 MB.'
      : pickError === 'unreadable'
        ? 'Não foi possível ler este PDF.'
        : null;
  const noChords = pickError === 'no-chords' && (
    <div role="alert" className="banner banner-error">
      <strong>✕ Não encontramos acordes neste PDF.</strong>
      <p>
        Os acordes precisam estar em negrito, numa linha acima da letra. PDF escaneado ou imagem não
        funciona.
      </p>
    </div>
  );

  if (fileState.status !== 'ready') {
    if (reading) {
      return (
        <section className="upload">
          <h1 className="page-title">Nova cifra</h1>
          <p role="status" className="status">
            Lendo PDF…
          </p>
        </section>
      );
    }
    return (
      <section className="upload">
        <h1 className="page-title">Nova cifra</h1>
        {pickError === 'no-chords' ? (
          noChords
        ) : (
          <p className="muted">Escolha o PDF da cifra. Nós lemos o título, o cantor e o tom.</p>
        )}
        {picker(pickError === 'no-chords' ? 'Escolher outro arquivo' : 'Escolher PDF')}
        {pickErrorText && (
          <p role="alert" className="error">
            {pickErrorText}
          </p>
        )}
      </section>
    );
  }

  const keys = minor ? KEY_OPTIONS.minor : KEY_OPTIONS.major;
  const saving = save === 'saving';
  const lookingUp = lookup.status === 'checking';
  const disabled =
    saving || reading || decision === 'blocked' || (valid && lookup.status !== 'done');
  const blockedKey = key;

  return (
    <section className="upload">
      <h1 className="page-title">Nova cifra</h1>
      <p role="status" className="banner banner-ok">
        ✓ {fileState.name} · {fileState.chordCount} acordes
      </p>
      {fileState.suspects.length > 0 && (
        <p role="status" className="banner banner-warn">
          Confira: não reconhecemos {fileState.suspects.join(', ')} como acorde.
        </p>
      )}
      {reading && (
        <p role="status" className="status">
          Lendo PDF…
        </p>
      )}
      {noChords}
      {pickErrorText && (
        <p role="alert" className="error">
          {pickErrorText}
        </p>
      )}
      {picker('Escolher outro arquivo')}

      <form
        className="upload-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <div className="field-head">
            <label htmlFor="up-title">Música</label>
            <Badge show={fromPdf.title} />
          </div>
          <input
            id="up-title"
            className="input"
            maxLength={MAX_TEXT}
            value={title}
            aria-invalid={attempted && titleError ? true : undefined}
            aria-describedby={attempted && titleError ? 'up-title-err' : undefined}
            onChange={(e) => {
              clearSaveError();
              setTitle(e.target.value);
              setFromPdf((f) => ({ ...f, title: false }));
            }}
          />
          {attempted && titleError && (
            <p id="up-title-err" className="field-error">
              {titleError}
            </p>
          )}
        </div>

        <div className="field">
          <div className="field-head">
            <label htmlFor="up-artist">Cantor</label>
            <Badge show={fromPdf.artist} />
          </div>
          <input
            id="up-artist"
            className="input"
            list="up-artists"
            maxLength={MAX_TEXT}
            value={artist}
            aria-invalid={attempted && artistError ? true : undefined}
            aria-describedby={attempted && artistError ? 'up-artist-err' : undefined}
            onChange={(e) => {
              clearSaveError();
              setArtist(e.target.value);
              setFromPdf((f) => ({ ...f, artist: false }));
            }}
          />
          <datalist id="up-artists">
            {artists.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {attempted && artistError && (
            <p id="up-artist-err" className="field-error">
              {artistError}
            </p>
          )}
        </div>

        <button
          type="button"
          className="link-btn"
          onClick={() => {
            clearSaveError();
            setTitle(artist);
            setArtist(title);
            setFromPdf((f) => ({ ...f, title: f.artist, artist: f.title }));
          }}
        >
          ⇄ inverter música/cantor
        </button>

        <div className="field">
          <div className="field-head">
            <label htmlFor="up-key">Tom</label>
            <Badge show={fromPdf.key} />
          </div>
          <div className="key-row">
            <select
              id="up-key"
              ref={keyRef}
              className="input"
              value={key}
              aria-invalid={attempted && keyError ? true : undefined}
              aria-describedby={attempted && keyError ? 'up-key-err' : undefined}
              onChange={(e) => editKey(e.target.value)}
            >
              <option value="">Escolha…</option>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <div role="group" aria-label="Modo do tom" className="mode">
              {[
                { label: 'Maior', value: false },
                { label: 'Menor', value: true },
              ].map((mode) => (
                <button
                  key={mode.label}
                  type="button"
                  className="btn"
                  aria-pressed={minor === mode.value}
                  onClick={() => {
                    if (minor === mode.value) return;
                    setMinor(mode.value);
                    editKey('');
                    keyRef.current?.focus();
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          {attempted && keyError && (
            <p id="up-key-err" className="field-error">
              {keyError}
            </p>
          )}
        </div>

        {decision === 'add-key' && (
          <p role="status" className="banner banner-warn">
            Essa música já existe. Vamos adicionar o tom {keyLabel}.
          </p>
        )}
        {decision === 'replace-generated' && (
          <p role="status" className="banner banner-warn">
            Essa música já existe. O tom {keyLabel} foi gerado pelo sistema. O seu PDF feito à mão
            vai substituir o gerado.
          </p>
        )}
        {decision === 'blocked' && (
          <p role="status" className="banner banner-warn">
            Essa música já tem um PDF feito à mão em {blockedKey}. Para trocar, peça a um admin para
            apagar o tom antes.
          </p>
        )}
        {lookup.status === 'error' && (
          <div role="alert" className="error">
            <p>Não foi possível verificar a música.</p>
            <button type="button" className="link-btn" onClick={retryLookup}>
              Tentar de novo
            </button>
          </div>
        )}
        {save === 'conflict' && (
          <p role="alert" className="error">
            Esse tom acabou de ser salvo por outra pessoa.
          </p>
        )}
        {save === 'failed' && (
          <p role="alert" className="error">
            Não foi possível salvar. Tente de novo.
          </p>
        )}

        <div className="sticky-bar">
          <button type="submit" className="btn btn-primary btn-block" disabled={disabled}>
            {saving ? 'Salvando…' : lookingUp ? 'Verificando…' : buttonLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
