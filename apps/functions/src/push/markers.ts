import { getFirestore } from 'firebase-admin/firestore';

// Código gRPC ALREADY_EXISTS: a marca já foi criada. O Admin SDK pode devolver número ou nome.
const ALREADY_EXISTS = 6;
const ALREADY_EXISTS_NAME = 'ALREADY_EXISTS';

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
        if (typeof error === 'object' && error !== null) {
          const code = (error as { code?: unknown }).code;
          if (code === ALREADY_EXISTS || code === ALREADY_EXISTS_NAME) return 'exists';
        }
        throw error;
      }
    },
  };
}
