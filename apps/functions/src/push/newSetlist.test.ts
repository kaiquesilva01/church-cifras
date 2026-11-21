import { afterEach, describe, expect, it } from 'vitest';
import {
  buildNewSetlistMessage,
  formatCultoDate,
  readSetlist,
  shouldAnnounce,
  type SetlistSnapshot,
} from './newSetlist';

const snap = (itemCount: number, extra: Partial<SetlistSnapshot> = {}): SetlistSnapshot => ({
  date: '2026-11-22',
  label: 'Culto de domingo',
  itemCount,
  origin: 'producao',
  createdBy: 'a1',
  updatedBy: 'm1',
  ...extra,
});

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('shouldAnnounce: a hora de avisar', () => {
  it.each([
    ['0 para 4', snap(0), snap(4), true],
    ['3 para 4', snap(3), snap(4), true],
    ['criação com 4', undefined, snap(4), true],
    ['criação com 5', undefined, snap(5), true],
    ['4 para 5', snap(4), snap(5), false],
    ['5 para 4', snap(5), snap(4), false],
    ['4 para 3', snap(4), snap(3), false],
    ['0 para 3', snap(0), snap(3), false],
    ['criação com 3', undefined, snap(3), false],
    ['exclusão (sem depois)', snap(4), undefined, false],
    ['só rótulo com 4 (antes 4)', snap(4), snap(4, { label: 'Outro' }), false],
    [
      'só hora ou tom com 3 (antes 3)',
      snap(3, { date: '2026-11-22' }),
      snap(3, { date: '2026-11-29' }),
      false,
    ],
  ])('%s', (_name, before, after, expected) => {
    expect(shouldAnnounce(before, after)).toBe(expected);
  });
});

describe('readSetlist', () => {
  it('conta items.length e lê a origem; ausente vira produção', () => {
    expect(
      readSetlist({
        date: '2026-11-22',
        label: 'L',
        items: [{}, {}],
        createdBy: 'a',
        updatedBy: 'b',
      }),
    ).toEqual({
      date: '2026-11-22',
      label: 'L',
      itemCount: 2,
      origin: 'producao',
      createdBy: 'a',
      updatedBy: 'b',
    });
  });

  it('origem desconhecida vira produção; teste passa', () => {
    expect(readSetlist({ origin: 'outra', items: [] })?.origin).toBe('producao');
    expect(readSetlist({ origin: 'teste', items: [] })?.origin).toBe('teste');
  });

  it('lê expiresAt de Date ou de Timestamp; ausente é undefined', () => {
    const d = new Date('2027-01-31T03:00:00Z');
    expect(readSetlist({ items: [], expiresAt: d })?.expiresAt).toEqual(d);
    expect(readSetlist({ items: [], expiresAt: { toDate: () => d } })?.expiresAt).toEqual(d);
    expect(readSetlist({ items: [] })?.expiresAt).toBeUndefined();
  });

  it('sem items é zero; sem dados é undefined', () => {
    expect(readSetlist({ date: '2026-11-22' })?.itemCount).toBe(0);
    expect(readSetlist(undefined)).toBeUndefined();
  });
});

describe('formatCultoDate: dia da semana independe do fuso', () => {
  it('formata dia abreviado e dd/mm', () => {
    expect(formatCultoDate('2026-11-22')).toBe('dom 22/11');
    expect(formatCultoDate('2026-11-21')).toBe('sáb 21/11');
  });

  it.each(['Pacific/Kiritimati', 'America/Los_Angeles'])('mesmo resultado no fuso %s', (tz) => {
    process.env.TZ = tz;
    expect(formatCultoDate('2026-11-22')).toBe('dom 22/11');
  });

  it('recusa data que não existe ou fora do formato', () => {
    expect(formatCultoDate('2026-02-31')).toBeNull();
    expect(formatCultoDate('')).toBeNull();
    expect(formatCultoDate('22/11/2026')).toBeNull();
  });
});

describe('buildNewSetlistMessage', () => {
  it('criação: exclui createdBy (não updatedBy); texto, link, tag e origem', () => {
    expect(
      buildNewSetlistMessage('r1', snap(4, { createdBy: 'a1', updatedBy: 'm1' }), undefined),
    ).toEqual({
      title: 'Novo repertório',
      body: 'Culto de domingo · dom 22/11',
      link: '/repertorios/r1',
      tag: 'setlist-r1-novo',
      origin: 'producao',
      excludeUid: 'a1',
      respectSwitch: true,
    });
  });

  it('atualização: exclui updatedBy, não createdBy', () => {
    const msg = buildNewSetlistMessage(
      'r1',
      snap(4, { createdBy: 'a1', updatedBy: 'm1' }),
      snap(3),
    );
    expect(msg?.excludeUid).toBe('m1');
  });

  it('repassa a origem teste', () => {
    expect(buildNewSetlistMessage('r1', snap(4, { origin: 'teste' }), snap(3))?.origin).toBe(
      'teste',
    );
  });

  it('data inválida não monta mensagem', () => {
    expect(buildNewSetlistMessage('r1', snap(4, { date: '2026-02-31' }), snap(3))).toBeNull();
  });
});
