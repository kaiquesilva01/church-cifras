import { describe, expect, it } from 'vitest';
import type { KeyName } from '@cifras/chords';
import type { ClassifiedRow } from './batch';
import { toCsv } from './csv';

const mk = (over: Partial<ClassifiedRow>): ClassifiedRow =>
  ({
    id: 'x',
    fileName: 'a.pdf',
    title: 'Música',
    artist: 'Cantor',
    key: 'G' as KeyName,
    status: 'fora do padrão',
    detail: '0 acordes',
    warnings: [],
    ...over,
  }) as unknown as ClassifiedRow;

describe('toCsv', () => {
  it('starts with BOM and header and uses semicolons', () => {
    const csv = toCsv([mk({})]);
    expect(
      csv.startsWith(String.fromCharCode(0xfeff) + 'arquivo;música;cantor;tom;status;detalhe\r\n'),
    ).toBe(true);
    expect(csv).toContain('a.pdf;Música;Cantor;G;fora do padrão;0 acordes');
  });

  it('escapes quotes, semicolons and newlines', () => {
    const csv = toCsv([mk({ title: 'Ele disse "oi"; tchau', detail: 'a\nb' })]);
    expect(csv).toContain('"Ele disse ""oi""; tchau"');
    expect(csv).toContain('"a\nb"');
  });

  it('leaves out importable rows and handles a missing key', () => {
    const csv = toCsv([mk({ id: 'ok', status: 'pronto', fileName: 'ok.pdf' }), mk({ key: null })]);
    expect(csv).not.toContain('ok.pdf');
    expect(csv).toContain('a.pdf;Música;Cantor;;');
  });

  it('includes rows that failed on import', () => {
    const csv = toCsv(
      [mk({ id: 'e', status: 'pronto', fileName: 'e.pdf' })],
      new Map([['e', { status: 'error' as const, message: 'boom' }]]),
    );
    expect(csv).toContain('e.pdf;Música;Cantor;G;erro;boom');
  });
});
