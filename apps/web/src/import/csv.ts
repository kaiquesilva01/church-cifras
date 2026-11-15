import { isImportable, type ClassifiedRow } from './batch';
import type { RowResult } from './queue';

const BOM = String.fromCharCode(0xfeff);
const HEADER = ['arquivo', 'música', 'cantor', 'tom', 'status', 'detalhe'];

// Spreadsheets run cells starting with these characters as formulas.
const cell = (raw: string): string => {
  const value = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

/**
 * Report of rows that did not get in: blocked by classification, or failed
 * during or never reached by the import when `results` is given (`cancelado`). UTF-8 BOM so Excel reads accents.
 */
export function toCsv(
  rows: ClassifiedRow[],
  results?: Map<string, RowResult>,
  /** Ids queued by the import; rows outside it (added later) are not `cancelado`. */
  queued?: ReadonlySet<string>,
): string {
  const lines = [HEADER.join(';')];
  for (const row of rows) {
    const result = results?.get(row.id);
    let status: string;
    let detail: string;
    if (!isImportable(row)) {
      status = row.status;
      detail = [row.detail, ...row.warnings].filter(Boolean).join('; ');
    } else if (result?.status === 'error') {
      status = 'erro';
      detail = result.message;
    } else if (results && !result && (!queued || queued.has(row.id))) {
      // An import ran (or was cancelled) and never reached this row.
      status = 'cancelado';
      detail = 'a importação foi cancelada antes deste arquivo';
    } else {
      continue;
    }
    lines.push(
      [row.fileName, row.title, row.artist, row.key ?? '', status, detail].map(cell).join(';'),
    );
  }
  return BOM + `${lines.join('\r\n')}\r\n`;
}
