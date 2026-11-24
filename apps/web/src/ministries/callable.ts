export const GENERIC_MESSAGE = 'Não foi possível concluir. Tente de novo.';
/** Códigos do servidor cuja `message` é a que a pessoa vê (HttpsError). */
export const KNOWN_CODES = [
  'failed-precondition',
  'permission-denied',
  'not-found',
  'invalid-argument',
] as const;

export class CallableError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CallableError';
  }
}

export async function callCallable<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown };
    const code = typeof e.code === 'string' ? e.code.replace(/^functions\//, '') : 'unknown';
    const serverMessage = typeof e.message === 'string' ? e.message : undefined;
    const known = (KNOWN_CODES as readonly string[]).includes(code) && serverMessage !== undefined;
    throw new CallableError(code, known ? serverMessage : GENERIC_MESSAGE);
  }
}

/** Mensagem para a pessoa: a do servidor quando o código é conhecido; senão o `fallback`. */
export function messageFor(error: unknown, fallback: string): string {
  return error instanceof CallableError && (KNOWN_CODES as readonly string[]).includes(error.code)
    ? error.message
    : fallback;
}
