// Sem teste unitário: fiação. Mesmo padrão de push/setlistTrigger.ts:
// getFirestore() só dentro das closures, nunca na carga do módulo.
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HAJALUZ_ID } from './model';
import { syncSetlistMirror, type MirrorDeps } from './mirror';

const realMirrorDeps: MirrorDeps = {
  readRoot: async (id) => {
    const snap = await getFirestore().doc(`setlists/${id}`).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  },
  writeTarget: async (id, data) => {
    await getFirestore().doc(`ministries/${HAJALUZ_ID}/setlists/${id}`).set(data);
  },
  deleteTarget: async (id) => {
    await getFirestore().doc(`ministries/${HAJALUZ_ID}/setlists/${id}`).delete();
  },
};

// Não exportado ainda: a Task 12 liga no index.ts.
// Escreve só no caminho do ministério, então não dispara o aviso de push (que ouve `setlists/{id}`).
export const mirrorSetlists = onDocumentWritten(
  { document: 'setlists/{setlistId}', region: 'southamerica-east1', retry: true },
  (event) => syncSetlistMirror(realMirrorDeps, event.params.setlistId),
);
