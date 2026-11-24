import { useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { readDismissRecord, writeDismissRecord } from '../lib/dismissRecord';
import {
  isStandalone,
  localStorageOrUndefined,
  readInstallEnvironment,
} from '../pwa/installPolicy';
import { ConviteCard } from '../ui/ConviteCard';
import { AVISOS_RECORD_KEY, decideAvisosCard, isOfferStatus } from './avisosPolicy';
import { avisosSession, type AvisosSession } from './avisosSession';
import { BELL_PATH } from './bell';
import { usePushAvisos } from './usePushAvisos';
import { PushContext, type PushService } from './types';

export interface AvisosCardProps {
  session?: AvisosSession;
}

/**
 * Convite "Ative os avisos" na aba Músicas. Enquanto não é elegível, não chama `load()`:
 * a elegibilidade é decidida antes de montar `AvisosOffer` (que usa `usePushAvisos`).
 */
export function AvisosCard({ session = avisosSession }: AvisosCardProps) {
  const service = useContext(PushContext);
  const { ministry } = useAuth();
  const [environment] = useState(() => readInstallEnvironment(window));
  const [storage] = useState(() => localStorageOrUndefined(window));
  const [dismissedAt] = useState(() => readDismissRecord(storage, AVISOS_RECORD_KEY).dismissedAt);
  // Relógio lido uma vez por montagem: o cartão é decidido ao abrir a aba, não a cada render.
  const [now] = useState(() => Date.now());
  if (!service) return null;
  const mode = decideAvisosCard({
    canEdit: ministry !== null,
    standalone: isStandalone(environment),
    dismissedAt,
    now,
    sessionClosed: session.isClosed(),
  });
  if (mode === 'hidden') return null;
  return <AvisosOffer service={service} session={session} storage={storage} />;
}

interface AvisosOfferProps {
  service: PushService;
  session: AvisosSession;
  storage: Pick<Storage, 'setItem'> | undefined;
}

function AvisosOffer({ service, session, storage }: AvisosOfferProps) {
  const view = usePushAvisos(service);
  const { status, sendTest } = view;
  const [gone, setGone] = useState(false);
  // Marca o toque em "Ativar". O desfecho vem do status (o SDK decide, o cartão não).
  const asked = useRef(false);

  useEffect(() => {
    if (!asked.current || status === 'enabling') return;
    asked.current = false;
    session.close();
    if (status === 'active') sendTest();
  }, [status, sendTest, session]);

  if (gone || !isOfferStatus(status)) return null;
  const busy = status === 'enabling';

  return (
    <ConviteCard
      icon={
        <span className="convite__tile" aria-hidden="true">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={BELL_PATH} />
          </svg>
        </span>
      }
      title="Ative os avisos"
      hint="Repertório novo e lembrete do ensaio"
      busy={busy}
      onClose={() => {
        writeDismissRecord(storage, AVISOS_RECORD_KEY, { dismissedAt: Date.now() });
        session.close();
        setGone(true);
      }}
      action={{
        label: busy ? 'Ativando…' : 'Ativar',
        disabled: busy,
        onClick: () => {
          // Sem await antes: o SDK pede a permissão dentro deste toque. O guarda impede o segundo pedido.
          if (status !== 'available') return;
          asked.current = true;
          view.enable();
        },
      }}
    />
  );
}
