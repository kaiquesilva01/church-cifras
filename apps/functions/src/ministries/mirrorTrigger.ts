// Fiação sem teste unitário. getFirestore() só dentro das closures, nunca na carga do módulo.
// A sincronização roda numa transação do Admin SDK: a leitura da raiz trava o documento, então o
// destino reflete a raiz no momento do commit, mesmo com execuções concorrentes (sem regressão).
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HAJALUZ_ID } from './model';
import { syncSetlistMirror } from './mirror';

const rootRef = (id: string) => getFirestore().doc(`setlists/${id}`);
const targetRef = (id: string) => getFirestore().doc(`ministries/${HAJALUZ_ID}/setlists/${id}`);

// Escreve só no caminho do ministério, então não dispara o aviso de push (que ouve `setlists/{id}`).
export const mirrorSetlists = onDocumentWritten(
  { document: 'setlists/{setlistId}', region: 'southamerica-east1', retry: true },
  (event) => {
    const setlistId = event.params.setlistId;
    return getFirestore().runTransaction(async (tx) =>
      syncSetlistMirror(
        {
          readRoot: async (id) => {
            const snap = await tx.get(rootRef(id));
            return snap.exists ? (snap.data() as Record<string, unknown>) : null;
          },
          writeTarget: async (id, data) => {
            tx.set(targetRef(id), data);
          },
          deleteTarget: async (id) => {
            tx.delete(targetRef(id));
          },
        },
        setlistId,
      ),
    );
  },
);
