import { getFirestore } from 'firebase-admin/firestore';
import { createMarkerDeps } from './markers';
import { createPushDeps } from './adminDeps';
import type { ReminderDeps } from './reminders';

/**
 * Consulta por intervalo em campo único usa o índice automático (sem entrada em `firestore.indexes.json`);
 * a consulta de marcas filtra por igualdade num campo só.
 */
export function createReminderDeps(): ReminderDeps {
  return {
    ...createPushDeps(),
    ...createMarkerDeps(),
    /** Setlists com `rehearsalAt` em (after, until]. */
    listRehearsalSetlists: async (after, until) =>
      (
        await getFirestore()
          .collection('setlists')
          .where('rehearsalAt', '>', after)
          .where('rehearsalAt', '<=', until)
          .get()
      ).docs.map((d) => ({ id: d.id, data: d.data() })),
    listRehearsalMarkers: async (setlistId) =>
      (
        await getFirestore().collection('avisosEnviados').where('setlistId', '==', setlistId).get()
      ).docs.map((d) => d.data()),
  };
}
