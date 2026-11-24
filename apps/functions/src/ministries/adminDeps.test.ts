import { describe, expect, it } from 'vitest';
import { toMembership, toMemberships, toPending, toRequest, toUser } from './adminDeps';

// Documento de consulta de grupo: o ministério é o pai da coleção `members`/`requests`.
const groupDoc = (ministryId: string, data: Record<string, unknown>) => ({
  ref: { parent: { parent: { id: ministryId } } },
  get: (field: string) => data[field],
});

describe('adaptador admin: consultas de grupo (dentro ou fora da transação)', () => {
  it('vínculos devolvem o ministério do caminho e o papel', () => {
    expect(
      toMemberships({
        docs: [groupDoc('hajaluz', { role: 'admin' }), groupDoc('outro', { role: 'member' })],
      }),
    ).toEqual([
      { ministryId: 'hajaluz', role: 'admin' },
      { ministryId: 'outro', role: 'member' },
    ]);
  });

  it('pedidos pendentes devolvem só o ministério do caminho', () => {
    expect(toPending({ docs: [groupDoc('hajaluz', { status: 'pending' })] })).toEqual([
      { ministryId: 'hajaluz' },
    ]);
  });

  it('sem documentos, devolvem lista vazia', () => {
    expect(toMemberships({ docs: [] })).toEqual([]);
    expect(toPending({ docs: [] })).toEqual([]);
  });
});

describe('adaptador admin: mapeamento de documentos', () => {
  it('usuário ausente vira null', () => {
    expect(toUser(undefined)).toBeNull();
  });

  it('usuário sem campos opcionais grava null (o Firestore recusa undefined)', () => {
    expect(toUser({ role: 'member' })).toEqual({
      role: 'member',
      appAdmin: false,
      displayName: null,
      email: null,
      photoURL: null,
    });
  });

  it('papel desconhecido vira undefined e appAdmin só vale se for true', () => {
    expect(toUser({ role: 'superuser', appAdmin: 'sim' })).toMatchObject({
      role: undefined,
      appAdmin: false,
    });
    expect(toUser({ role: 'admin', appAdmin: true, email: 'pessoa@exemplo.com' })).toMatchObject({
      role: 'admin',
      appAdmin: true,
      email: 'pessoa@exemplo.com',
    });
  });

  it('membership usa o uid do caminho e preenche campos ausentes com null', () => {
    expect(toMembership(undefined, 'u1')).toBeNull();
    expect(toMembership({ role: 'admin', displayName: 'Ana' }, 'u1')).toEqual({
      uid: 'u1',
      role: 'admin',
      displayName: 'Ana',
      email: null,
      photoURL: null,
    });
  });

  it('pedido mantém o status e usa o uid do caminho', () => {
    expect(toRequest(undefined, 'u2')).toBeNull();
    expect(toRequest({ status: 'pending', photoURL: 'https://exemplo.com/f.png' }, 'u2')).toEqual({
      uid: 'u2',
      status: 'pending',
      displayName: null,
      email: null,
      photoURL: 'https://exemplo.com/f.png',
    });
  });
});
