import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { announceNewSetlist, type AnnounceDeps } from './announce';
import { createPushDeps } from './adminDeps';
import { createMarkerDeps } from './markers';

const deps: AnnounceDeps = { ...createPushDeps(), ...createMarkerDeps() };

// Sem retry: a marca já foi criada, e um reenvio automático duplicaria o aviso se a marca falhar depois.
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
