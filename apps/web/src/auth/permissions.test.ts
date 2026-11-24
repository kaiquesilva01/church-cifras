import { describe, expect, it } from 'vitest';
import { authStateFor } from '../test/authState';
import { canShowRepertorios, isMinistryLoading } from './permissions';

describe('isMinistryLoading', () => {
  it('é verdadeiro com acesso liberado, sem admin da app, sem ministério e sem falha', () => {
    expect(isMinistryLoading(authStateFor(null))).toBe(true);
  });

  it('é falso para o admin da app sem ministério (não fica carregando)', () => {
    expect(isMinistryLoading({ ...authStateFor(null), appAdmin: true })).toBe(false);
  });

  it('é falso quando o ministério carregou ou falhou', () => {
    expect(isMinistryLoading(authStateFor('member'))).toBe(false);
    expect(isMinistryLoading({ ...authStateFor(null), ministryFailed: true })).toBe(false);
  });

  it('é falso sem acesso liberado', () => {
    expect(isMinistryLoading({ ...authStateFor(null), access: 'blocked' })).toBe(false);
  });
});

describe('canShowRepertorios', () => {
  it('mostra com ministério e enquanto o ministério carrega', () => {
    expect(canShowRepertorios(authStateFor('member'))).toBe(true);
    expect(canShowRepertorios(authStateFor(null))).toBe(true);
  });

  it('esconde do admin da app sem ministério e de quem não tem acesso', () => {
    expect(canShowRepertorios({ ...authStateFor(null), appAdmin: true })).toBe(false);
    expect(canShowRepertorios({ ...authStateFor(null), access: 'blocked' })).toBe(false);
  });
});
