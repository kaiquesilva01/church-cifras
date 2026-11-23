export interface AvisosSession {
  isClosed(): boolean;
  close(): void;
  /** Só para testes: reabre a sessão. O app não chama. */
  reset(): void;
}

export function createAvisosSession(): AvisosSession {
  let closed = false;
  return {
    isClosed: () => closed,
    close: () => {
      closed = true;
    },
    reset: () => {
      closed = false;
    },
  };
}

/**
 * Fechada por qualquer desfecho do convite de avisos e por Desativar na aba Mais.
 * Em memória: reabre só com a recarga do app (mesmo padrão de `installPromptStore`).
 */
export const avisosSession = createAvisosSession();
