/** Primeiro `storagePath` utilizável (string não vazia) entre os arranjos feitos à mão da música. */
export function pickHandmadePath(paths: unknown[]): string | null {
  const path = paths.find((p): p is string => typeof p === 'string' && p !== '');
  return path ?? null;
}
