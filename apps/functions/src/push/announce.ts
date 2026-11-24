import { buildNewSetlistMessage, readSetlist, shouldAnnounce } from './newSetlist';
import type { MarkerDeps } from './markers';
import { sendToDevices } from './send';
import type { PushDeps } from './types';

/** Validade mínima da marca de aviso. */
export const NEW_SETLIST_TTL_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A marca vence no maior valor entre agora + 60 dias e o `expiresAt` do repertório. */
export function markerExpiresAt(now: Date, setlistExpiresAt: Date | undefined): Date {
  const minimum = now.getTime() + NEW_SETLIST_TTL_DAYS * DAY_MS;
  if (setlistExpiresAt !== undefined && setlistExpiresAt.getTime() > minimum) {
    return setlistExpiresAt;
  }
  return new Date(minimum);
}

/** Código do erro para o log: só texto ou número (um objeto poderia carregar dados do envio). */
export function failureCode(error: unknown): string | number {
  const raw =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return typeof raw === 'string' || typeof raw === 'number' ? raw : 'error';
}

export type AnnounceDeps = PushDeps & MarkerDeps;

export type AnnounceResult =
  'not-due' | 'invalid' | 'already-announced' | 'blocked' | 'sent' | 'failed';

/** Avisa o repertório novo: marca antes do envio, para que a reentrega não duplique. */
export async function announceNewSetlist(
  deps: AnnounceDeps,
  setlistId: string,
  ministryId: string,
  beforeData: Record<string, unknown> | undefined,
  afterData: Record<string, unknown> | undefined,
): Promise<AnnounceResult> {
  const before = readSetlist(beforeData);
  const after = readSetlist(afterData);
  if (after === undefined || !shouldAnnounce(before, after)) return 'not-due';

  const input = buildNewSetlistMessage(setlistId, ministryId, after, before);
  if (input === null) return 'invalid';

  const now = deps.now();
  const claim = await deps.claimMarker(`${setlistId}_novo`, {
    setlistId,
    tipo: 'novo',
    createdAt: now,
    expiresAt: markerExpiresAt(now, after.expiresAt),
  });
  if (claim === 'exists') return 'already-announced';

  try {
    const outcome = await sendToDevices(deps, input);
    if (outcome.blocked) {
      console.info('push: repertório novo bloqueado pelo interruptor', { setlistId });
      return 'blocked';
    }
    console.info('push: repertório novo avisado', {
      setlistId,
      sent: outcome.sent,
      failed: outcome.failed,
      pruned: outcome.pruned,
    });
    return 'sent';
  } catch (error) {
    console.error('push: falha ao avisar repertório novo', {
      setlistId,
      code: failureCode(error),
    });
    return 'failed';
  }
}
