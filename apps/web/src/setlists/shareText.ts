export type ShareTextOutcome = 'shared' | 'cancelled' | 'copied';

/**
 * Compartilha um texto pela folha do aparelho (Web Share). Sem Web Share (computador), copia o
 * texto. Cancelar a folha não é erro: resolve `cancelled`. Outras falhas são relançadas.
 */
export async function shareText(text: string): Promise<ShareTextOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      // O link vai dentro do texto: alguns apps descartam `url` quando há `text`.
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if ((err as { name?: unknown } | null)?.name === 'AbortError') return 'cancelled';
      throw err;
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
