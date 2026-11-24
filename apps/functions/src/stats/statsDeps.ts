import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ministryIdOf } from '../ministries/model';
import type { SettledSetlist } from './countUsage';
import type { StatsDeps } from './getStats';

// Código gRPC ALREADY_EXISTS: o documento de setlistUsage já foi criado.
const ALREADY_EXISTS = 6;
// Limite de referências por chamada de getAll.
const GET_ALL_BLOCK = 300;

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string');
}

type SetlistRef = { id: string; parent: { parent: { id: string } | null } };

/**
 * Mapeia um repertório do grupo `setlists`. Raiz `setlists/{sid}` (sem ministério) vira null:
 * é congelada e não conta. O ministryId vem do caminho do documento, nunca de um valor fixo.
 */
export function toSettledSetlist(
  ref: SetlistRef,
  data: Record<string, unknown>,
): SettledSetlist | null {
  const ministryId = ministryIdOf(ref);
  if (!ministryId) return null;
  return {
    id: ref.id,
    ministryId,
    date: String(data.date ?? ''),
    songIds: (Array.isArray(data.items) ? data.items : [])
      .map((item) => (item as { songId?: unknown } | null)?.songId)
      .filter((id): id is string => typeof id === 'string'),
  };
}

/** Uso sem ministryId (gravado antes da #136) vira '' e fica fora de todo ranking de ministério. */
export function toUsage(data: Record<string, unknown>): {
  date: string;
  songIds: string[];
  ministryId: string;
} {
  return {
    date: String(data.date ?? ''),
    songIds: stringIds(data.songIds),
    ministryId: typeof data.ministryId === 'string' ? data.ministryId : '',
  };
}

export function createStatsDeps(): StatsDeps {
  return {
    listSettledSetlists: async (cutoff) => {
      // O grupo traz também a raiz setlists/{sid} (congelada): ela não tem ministério e não conta.
      const snap = await getFirestore()
        .collectionGroup('setlists')
        .where('date', '<=', cutoff)
        .get();
      return snap.docs.flatMap((d) => {
        const setlist = toSettledSetlist(d.ref, d.data());
        return setlist ? [setlist] : [];
      });
    },
    recordUsage: async ({ setlistId, date, songIds, ministryId }) => {
      try {
        await getFirestore()
          .doc(`setlistUsage/${setlistId}`)
          .create({ date, songIds, ministryId, countedAt: FieldValue.serverTimestamp() });
        return 'created';
      } catch (error) {
        if ((error as { code?: unknown }).code === ALREADY_EXISTS) return 'exists';
        throw error;
      }
    },
    countSongs: async () => (await getFirestore().collection('songs').count().get()).data().count,
    // Sem filtro de propósito: uma consulta de grupo filtrada exigiria índice.
    listArrangementSources: async () =>
      (await getFirestore().collectionGroup('arrangements').select('source').get()).docs.map((d) =>
        String(d.data().source ?? ''),
      ),
    listPdfSizes: async () => {
      const [files] = await getStorage().bucket().getFiles({ prefix: 'songs/' });
      return files.filter((f) => f.name.endsWith('.pdf')).map((f) => Number(f.metadata.size) || 0);
    },
    // Sem where de propósito: a coleção é pequena e o ministryId filtra em memória (evita índice composto).
    listUsage: async () =>
      (await getFirestore().collection('setlistUsage').get()).docs.map((d) => toUsage(d.data())),
    getSongs: async (ids) => {
      const songs = new Map<string, { title: string; artistName: string }>();
      if (ids.length === 0) return songs;
      const db = getFirestore();
      for (let start = 0; start < ids.length; start += GET_ALL_BLOCK) {
        const block = ids.slice(start, start + GET_ALL_BLOCK);
        const snaps = await db.getAll(...block.map((id) => db.doc(`songs/${id}`)));
        for (const snap of snaps) {
          if (!snap.exists) continue;
          const data = snap.data() ?? {};
          songs.set(snap.id, {
            title: String(data.title ?? ''),
            artistName: String(data.artistName ?? ''),
          });
        }
      }
      return songs;
    },
    now: () => new Date(),
  };
}
