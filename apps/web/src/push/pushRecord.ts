import type { PushRecord, PushRecordStore } from './types';

/** Versionada: mudar o formato pede nova chave. */
export const PUSH_RECORD_KEY = 'cifras.push.v1';
/** O SDK troca o token cerca de uma vez por semana; passado esse prazo, o aparelho é regravado. */
export const REGISTER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isPushRecord(value: unknown): value is PushRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<PushRecord>;
  return typeof v.token === 'string' && v.token.length > 0 && typeof v.registeredAt === 'number';
}

/** Storage pode ser ausente ou lançar (modo privado). Nada aqui lança. */
export function createPushRecordStore(storage: StorageLike | undefined): PushRecordStore {
  return {
    read() {
      try {
        const raw = storage?.getItem(PUSH_RECORD_KEY);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        return isPushRecord(value) ? value : null;
      } catch {
        return null;
      }
    },
    write(record) {
      try {
        storage?.setItem(PUSH_RECORD_KEY, JSON.stringify(record));
      } catch {
        // Sem armazenamento: o próximo abrir do app revalida pelo SDK.
      }
    },
    clear() {
      try {
        storage?.removeItem(PUSH_RECORD_KEY);
      } catch {
        // Nada a limpar.
      }
    },
  };
}
