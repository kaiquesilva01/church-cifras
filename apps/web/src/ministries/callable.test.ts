import { describe, expect, it } from 'vitest';
import { CallableError, GENERIC_MESSAGE, callCallable, messageFor } from './callable';

describe('callCallable', () => {
  it('devolve o data quando a callable resolve', async () => {
    await expect(
      callCallable(() => Promise.resolve({ data: { ministryId: 'x' } })),
    ).resolves.toEqual({ ministryId: 'x' });
  });

  it('tira o prefixo functions/ e mantém a mensagem do servidor para código conhecido', async () => {
    const error = await callCallable(() =>
      Promise.reject({
        code: 'functions/failed-precondition',
        message: 'Este pedido não está pendente.',
      }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CallableError);
    expect(error).toMatchObject({
      code: 'failed-precondition',
      message: 'Este pedido não está pendente.',
    });
  });

  it('código desconhecido vira mensagem genérica', async () => {
    const error = await callCallable(() =>
      Promise.reject({ code: 'functions/internal', message: 'INTERNAL stack' }),
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'internal', message: GENERIC_MESSAGE });
  });

  it('erro sem código vira código unknown e mensagem genérica', async () => {
    const error = await callCallable(() => Promise.reject(new Error('rede caiu'))).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ code: 'unknown', message: GENERIC_MESSAGE });
  });

  it('código conhecido sem mensagem vira genérica', async () => {
    const error = await callCallable(() => Promise.reject({ code: 'functions/not-found' })).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ code: 'not-found', message: GENERIC_MESSAGE });
  });
});

describe('messageFor', () => {
  it('usa a mensagem do servidor para os quatro códigos conhecidos', () => {
    for (const code of [
      'failed-precondition',
      'permission-denied',
      'not-found',
      'invalid-argument',
    ]) {
      expect(messageFor(new CallableError(code, 'Servidor disse.'), 'Padrão')).toBe(
        'Servidor disse.',
      );
    }
  });

  it('usa o fallback para outros códigos e para erros que não são CallableError', () => {
    expect(messageFor(new CallableError('internal', GENERIC_MESSAGE), 'Padrão')).toBe('Padrão');
    expect(messageFor(new Error('x'), 'Padrão')).toBe('Padrão');
  });
});
