import { getFirestore } from 'firebase-admin/firestore';
import { ministryIdOf } from '../ministries/model';
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
    /**
     * Setlists com `rehearsalAt` em (after, until]. Consulta por grupo: exige o índice de `rehearsalAt`
     * do grupo `setlists`. O grupo também traz a raiz `setlists/{sid}` (congelada): só entra quem está
     * em `ministries/{mid}/setlists`.
     */
    listRehearsalSetlists: async (after, until) =>
      (
        await getFirestore()
          .collectionGroup('setlists')
          .where('rehearsalAt', '>', after)
          .where('rehearsalAt', '<=', until)
          .get()
      ).docs.flatMap((d) => {
        const ministryId = ministryIdOf(d.ref);
        return ministryId ? [{ id: d.id, ministryId, data: d.data() }] : [];
      }),
    listRehearsalMarkers: async (setlistId) =>
      (
        await getFirestore().collection('avisosEnviados').where('setlistId', '==', setlistId).get()
      ).docs.map((d) => d.data()),
  };
}
