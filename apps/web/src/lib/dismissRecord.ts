/** "Agora não" vale por 30 dias. Cada convite tem a sua chave versionada no localStorage. */
export const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

export interface DismissRecord {
  dismissedAt: number | null;
}

/** Dispensado nos últimos 30 dias. Data futura (relógio voltou) não conta. */
export function isDismissedAt(dismissedAt: number | null, now: number): boolean {
  if (dismissedAt === null) return false;
  const age = now - dismissedAt;
  return age >= 0 && age < DISMISS_MS;
}

/** Valor ausente, bloqueado ou inválido vale como "nunca dispensado". */
export function readDismissRecord(
  storage: Pick<Storage, 'getItem'> | undefined,
  key: string,
): DismissRecord {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return { dismissedAt: null };
    const parsed: unknown = JSON.parse(raw);
    const dismissedAt = (parsed as { dismissedAt?: unknown } | null)?.dismissedAt;
    return {
      dismissedAt:
        typeof dismissedAt === 'number' && Number.isFinite(dismissedAt) ? dismissedAt : null,
    };
  } catch {
    return { dismissedAt: null };
  }
}

export function writeDismissRecord(
  storage: Pick<Storage, 'setItem'> | undefined,
  key: string,
  record: DismissRecord,
): void {
  try {
    storage?.setItem(key, JSON.stringify(record));
  } catch {
    // Armazenamento bloqueado ou cheio: a dispensa vale só nesta sessão.
  }
}
