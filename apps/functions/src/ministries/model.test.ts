import { describe, expect, it } from 'vitest';
import {
  normalizeForSearch,
  paths,
  parseMembershipRole,
  readMinistryId,
  readUid,
  requireCaller,
  slugify,
  validateMinistryFields,
  ministryIdOf,
} from './model';

describe('ministryIdOf', () => {
  it('pai do pai é o ministério; raiz não tem', () => {
    expect(ministryIdOf({ parent: { parent: { id: 'hajaluz' } } })).toBe('hajaluz');
    expect(ministryIdOf({ parent: { parent: null } })).toBeUndefined();
  });
});

function errorOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('esperava erro, mas a função não lançou');
}

describe('slugify', () => {
  it('remove acento, pontuação e normaliza separadores', () => {
    expect(slugify('Vida Nova · Sumaré')).toBe('vida-nova-sumare');
  });

  it('retorna vazio quando não sobra nada', () => {
    expect(slugify('!!!')).toBe('');
  });

  it('corta em 60 caracteres sem deixar hífen no fim', () => {
    const slug = slugify(`${'a'.repeat(59)} bbbb`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('normalizeForSearch', () => {
  it('minúsculas, sem acento, espaços colapsados e trim', () => {
    expect(normalizeForSearch('  Sumaré   Norte ')).toBe('sumare norte');
  });
});

describe('validateMinistryFields', () => {
  it('apara espaços e aceita campos válidos', () => {
    expect(validateMinistryFields({ name: ' Haja Luz ', city: 'São Paulo' })).toEqual({
      name: 'Haja Luz',
      city: 'São Paulo',
    });
  });

  it('rejeita nome vazio com invalid-argument', () => {
    expect(errorOf(() => validateMinistryFields({ name: '', city: 'x' }))).toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('rejeita nome com mais de 60 caracteres', () => {
    expect(
      errorOf(() => validateMinistryFields({ name: 'a'.repeat(61), city: 'x' })),
    ).toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('readMinistryId', () => {
  it('aceita o slug', () => {
    expect(readMinistryId({ ministryId: 'hajaluz' })).toBe('hajaluz');
  });

  it('rejeita formato fora do slug com invalid-argument', () => {
    expect(errorOf(() => readMinistryId({ ministryId: 'Haja Luz' }))).toMatchObject({
      code: 'invalid-argument',
    });
    expect(errorOf(() => readMinistryId({ ministryId: '../x' }))).toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('readUid', () => {
  it('lê a chave pedida', () => {
    expect(readUid({ uid: 'u1' })).toBe('u1');
    expect(readUid({ memberUid: 'u2' }, 'memberUid')).toBe('u2');
  });

  it('rejeita vazio ou longo demais com invalid-argument', () => {
    expect(errorOf(() => readUid({ uid: '' }))).toMatchObject({ code: 'invalid-argument' });
  });

  it('rejeita uid com barra (quebraria o caminho do documento) com invalid-argument', () => {
    expect(errorOf(() => readUid({ uid: 'a/b' }))).toMatchObject({ code: 'invalid-argument' });
    expect(errorOf(() => readUid({ uid: '../users/x' }))).toMatchObject({
      code: 'invalid-argument',
    });
    expect(errorOf(() => readUid({ uid: 'x'.repeat(129) }))).toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('parseMembershipRole', () => {
  it('aceita admin e member', () => {
    expect(parseMembershipRole('admin')).toBe('admin');
    expect(parseMembershipRole('member')).toBe('member');
  });

  it('rejeita o resto com invalid-argument', () => {
    expect(errorOf(() => parseMembershipRole('viewer'))).toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('requireCaller', () => {
  it('devolve o uid quando existe', () => {
    expect(requireCaller('u1')).toBe('u1');
  });

  it('sem uid: unauthenticated', () => {
    expect(errorOf(() => requireCaller(undefined))).toMatchObject({ code: 'unauthenticated' });
  });
});

describe('paths', () => {
  it('monta os caminhos do Firestore', () => {
    expect(paths.user('u1')).toBe('users/u1');
    expect(paths.ministry('hajaluz')).toBe('ministries/hajaluz');
    expect(paths.member('hajaluz', 'u1')).toBe('ministries/hajaluz/members/u1');
    expect(paths.request('hajaluz', 'u1')).toBe('ministries/hajaluz/requests/u1');
  });
});
