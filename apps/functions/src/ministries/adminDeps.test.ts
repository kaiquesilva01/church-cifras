import { describe, expect, it } from 'vitest';
import { toMembership, toRequest, toUser } from './adminDeps';

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
