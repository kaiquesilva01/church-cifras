import { describe, expect, it } from 'vitest';
import { authStateFor } from '../test/authState';
import { canShowRepertorios, isMinistryLoading } from './permissions';

/** Vínculo ainda sem documento: o estado de carga do ministério. */
const pending = { ...authStateFor(null), ministryPending: true };

describe('isMinistryLoading', () => {
  it('é verdadeiro com acesso liberado e o documento do ministério pendente', () => {
    expect(isMinistryLoading(pending)).toBe(true);
  });

  it('é verdadeiro para o admin da app que é membro enquanto o ministério carrega', () => {
    expect(isMinistryLoading({ ...pending, appAdmin: true })).toBe(true);
  });

  it('é falso para o admin da app sem vínculo (nada para carregar)', () => {
    expect(isMinistryLoading({ ...authStateFor(null), appAdmin: true })).toBe(false);
  });

  it('é falso quando o ministério carregou ou falhou', () => {
    expect(isMinistryLoading(authStateFor('member'))).toBe(false);
    expect(isMinistryLoading({ ...authStateFor(null), ministryFailed: true })).toBe(false);
  });

  it('é falso sem acesso liberado', () => {
    expect(isMinistryLoading({ ...pending, access: 'blocked' })).toBe(false);
  });
});

describe('canShowRepertorios', () => {
  it('mostra com ministério e enquanto o ministério carrega', () => {
    expect(canShowRepertorios(authStateFor('member'))).toBe(true);
    expect(canShowRepertorios(pending)).toBe(true);
  });

  it('esconde do admin da app sem vínculo e de quem não tem acesso', () => {
    expect(canShowRepertorios({ ...authStateFor(null), appAdmin: true })).toBe(false);
    expect(canShowRepertorios({ ...pending, access: 'blocked' })).toBe(false);
  });
});
