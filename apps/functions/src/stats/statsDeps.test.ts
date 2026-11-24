import { describe, expect, it } from 'vitest';
import { toSettledSetlist, toUsage } from './statsDeps';

// Forma mínima de DocumentReference que ministryIdOf lê: ref.parent.parent.id.
const ministryDoc = (id: string, ministryId: string) => ({
  id,
  parent: { parent: { id: ministryId } },
});
const rootDoc = (id: string) => ({ id, parent: { parent: null } });

describe('toSettledSetlist', () => {
  it('descarta o documento da raiz setlists/{sid}', () => {
    expect(
      toSettledSetlist(rootDoc('s1'), { date: '2026-11-20', items: [{ songId: 'a' }] }),
    ).toBeNull();
  });

  it('leva o id do ministério do caminho do documento', () => {
    expect(
      toSettledSetlist(ministryDoc('s1', 'outro'), {
        date: '2026-11-20',
        items: [{ songId: 'a' }],
      }),
    ).toEqual({ id: 's1', ministryId: 'outro', date: '2026-11-20', songIds: ['a'] });
  });

  it('ignora itens sem songId string e aceita items ausente', () => {
    expect(
      toSettledSetlist(ministryDoc('s1', 'hajaluz'), {
        date: '2026-11-20',
        items: [{ songId: 'a' }, { songId: 3 }, null, {}],
      }),
    ).toMatchObject({ songIds: ['a'] });
    expect(toSettledSetlist(ministryDoc('s2', 'hajaluz'), { date: '2026-11-20' })).toMatchObject({
      songIds: [],
    });
  });
});

describe('toUsage', () => {
  it('uso sem ministryId vira ministryId vazio, fora de qualquer ranking', () => {
    expect(toUsage({ date: '2026-11-20', songIds: ['a'] })).toEqual({
      date: '2026-11-20',
      songIds: ['a'],
      ministryId: '',
    });
  });

  it('uso com ministryId mantém o valor gravado', () => {
    expect(toUsage({ date: '2026-11-20', songIds: ['a'], ministryId: 'hajaluz' })).toMatchObject({
      ministryId: 'hajaluz',
    });
  });

  it('ministryId que não é texto também vira vazio', () => {
    expect(toUsage({ date: '2026-11-20', songIds: [], ministryId: 5 })).toMatchObject({
      ministryId: '',
    });
  });
});
