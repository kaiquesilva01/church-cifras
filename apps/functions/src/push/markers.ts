import { getFirestore } from 'firebase-admin/firestore';

// Código gRPC ALREADY_EXISTS: a marca já foi criada.
const ALREADY_EXISTS = 6;

export type MarkerDeps = {
  /** Cria avisosEnviados/<id>. 'exists' quando a marca já existia (não enviar de novo). */
  claimMarker(id: string, data: Record<string, unknown>): Promise<'created' | 'exists'>;
};

/** Implementação real de MarkerDeps. `create` (nunca `set`): a marca é a trava. */
export function createMarkerDeps(): MarkerDeps {
  return {
    claimMarker: async (id, data) => {
      try {
        await getFirestore().doc(`avisosEnviados/${id}`).create(data);
        return 'created';
      } catch (error) {
        if ((error as { code?: unknown }).code === ALREADY_EXISTS) return 'exists';
        throw error;
      }
    },
  };
}
