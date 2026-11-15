import { isImportable, type ClassifiedRow } from './batch';
import type { RowResult } from './queue';

const BOM = String.fromCharCode(0xfeff);
const HEADER = ['arquivo', 'música', 'cantor', 'tom', 'status', 'detalhe'];

const cell = (value: string): string =>
  /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * Report of rows that did not get in: blocked by classification, or failed
 * during the import when `results` is given. UTF-8 BOM so Excel reads accents.
 */
export function toCsv(rows: ClassifiedRow[], results?: Map<string, RowResult>): string {
  const lines = [HEADER.join(';')];
  for (const row of rows) {
    const result = results?.get(row.id);
    let status: string;
    let detail: string;
    if (!isImportable(row)) {
      status = row.status;
      detail = row.detail;
    } else if (result?.status === 'error') {
      status = 'erro';
      detail = result.message;
    } else {
      continue;
    }
    lines.push(
      [row.fileName, row.title, row.artist, row.key ?? '', status, detail].map(cell).join(';'),
    );
  }
  return BOM + `${lines.join('\r\n')}\r\n`;
}
