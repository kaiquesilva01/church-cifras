import { isDismissedAt } from '../lib/dismissRecord';
import type { AvisosStatus } from './types';

/** Chave própria do convite de avisos (não é a do convite de instalação). */
export const AVISOS_RECORD_KEY = 'cifras.avisosCard.v1';

/** 'check' = vale consultar o estado dos avisos. Só então a Músicas chama `load()`. */
export type AvisosCardMode = 'hidden' | 'check';

export interface AvisosCardInput {
  canEdit: boolean;
  standalone: boolean;
  dismissedAt: number | null;
  now: number;
  sessionClosed: boolean;
}

export function decideAvisosCard(input: AvisosCardInput): AvisosCardMode {
  if (!input.canEdit || !input.standalone || input.sessionClosed) return 'hidden';
  if (isDismissedAt(input.dismissedAt, input.now)) return 'hidden';
  return 'check';
}

/** O cartão aparece com "disponível" e segue aparecendo durante o toque ("ativando"). */
export function isOfferStatus(status: AvisosStatus): boolean {
  return status === 'available' || status === 'enabling';
}
