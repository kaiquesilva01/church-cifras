import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { announceNewSetlist, type AnnounceDeps } from './announce';
import { createPushDeps } from './adminDeps';
import { createMarkerDeps } from './markers';

const deps: AnnounceDeps = { ...createPushDeps(), ...createMarkerDeps() };

// Sem retry. Um reenvio não duplicaria o aviso (a marca bloqueia o segundo envio), mas o gatilho
// fica sem reentrega: se criar a marca falhar com erro propagado, o aviso se perde. Trade-off aceito.
export const onSetlistWritten = onDocumentWritten(
  { document: 'setlists/{setlistId}', region: 'southamerica-east1', retry: false },
  (event) =>
    announceNewSetlist(
      deps,
      event.params.setlistId,
      event.data?.before.data(),
      event.data?.after.data(),
    ),
);
