import { KEY_OPTIONS, type KeyName } from '@cifras/chords';
import { memo } from 'react';
import { MAX_TEXT } from '../catalog/songText';
import type { BatchRow, BatchStatus, ClassifiedRow } from './batch';
import type { RowResult } from './queue';

const PILL: Record<BatchStatus, string> = {
  pronto: 'pill-green',
  'já existe — novo tom': 'pill-blue',
  'substitui gerado': 'pill-purple',
  'conflito: tom feito à mão já existe': 'pill-amber',
  'duplicado no lote': 'pill-amber',
  'falta a música': 'pill-amber',
  'falta o cantor': 'pill-amber',
  'falta o tom': 'pill-amber',
  'grande demais': 'pill-red',
  'fora do padrão': 'pill-red',
};

function describeResult(result: RowResult): { label: string; className: string } {
  if (result.status === 'imported') return { label: 'importado', className: 'pill-green' };
  if (result.status === 'existing') return { label: 'já existia', className: 'pill-blue' };
  return { label: `erro: ${result.message}`, className: 'pill-red' };
}

// One element shared by every row: identical across renders.
const KEY_OPTION_ELEMENTS = (
  <>
    <option value="">—</option>
    <optgroup label="Maiores">
      {KEY_OPTIONS.major.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </optgroup>
    <optgroup label="Menores">
      {KEY_OPTIONS.minor.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </optgroup>
  </>
);

export interface ImportRowProps {
  row: BatchRow;
  /** Latest classification of exactly this row; null while it is being reclassified. */
  classified: ClassifiedRow | null;
  result: RowResult | undefined;
  /** A read or import is running: inputs are inert. */
  busy: boolean;
  onEdit: (id: string, patch: Partial<BatchRow>) => void;
  onRemove: (id: string) => void;
}

export const ImportRow = memo(function ImportRow({
  row,
  classified,
  result,
  busy,
  onEdit,
  onRemove,
}: ImportRowProps) {
  const imported = result?.status === 'imported' || result?.status === 'existing';
  const locked = busy || imported;
  const pill = result ? describeResult(result) : null;
  return (
    <tr aria-label={row.fileName}>
      <th scope="row" className="cell-file" title={row.fileName}>
        {row.fileName}
      </th>
      <td>
        <input
          className="input"
          aria-label={`Música de ${row.fileName}`}
          maxLength={MAX_TEXT}
          value={row.title}
          disabled={locked}
          onChange={(e) => onEdit(row.id, { title: e.target.value })}
        />
      </td>
      <td>
        <button
          type="button"
          className="btn btn-icon"
          aria-label={`Inverter música e cantor de ${row.fileName}`}
          disabled={locked}
          onClick={() => onEdit(row.id, { title: row.artist, artist: row.title })}
        >
          ⇄
        </button>
      </td>
      <td>
        <input
          className="input"
          list="import-artists"
          aria-label={`Cantor de ${row.fileName}`}
          maxLength={MAX_TEXT}
          value={row.artist}
          disabled={locked}
          onChange={(e) => onEdit(row.id, { artist: e.target.value })}
        />
      </td>
      <td>
        <select
          className="input"
          aria-label={`Tom de ${row.fileName}`}
          value={row.key ?? ''}
          disabled={locked}
          onChange={(e) => onEdit(row.id, { key: (e.target.value || null) as KeyName | null })}
        >
          {KEY_OPTION_ELEMENTS}
        </select>
      </td>
      <td className="cell-num">{row.chordCount}</td>
      <td>
        {pill ? (
          <span className={`pill ${pill.className}`}>{pill.label}</span>
        ) : classified ? (
          <>
            <span className={`pill ${PILL[classified.status]}`}>{classified.status}</span>
            {classified.detail && <span className="cell-detail">{classified.detail}</span>}
            {classified.warnings.map((warning) => (
              <span key={warning} className="cell-detail cell-warning">
                {warning}
              </span>
            ))}
          </>
        ) : (
          <span className="muted">Verificando…</span>
        )}
      </td>
      <td>
        <button
          type="button"
          className="btn btn-icon"
          aria-label={`Remover ${row.fileName}`}
          disabled={busy}
          onClick={() => onRemove(row.id)}
        >
          ✕
        </button>
      </td>
    </tr>
  );
});
