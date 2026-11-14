import { compareKeys, parseKey, type KeyName } from '@cifras/chords';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

export function summarizeArrangements(docs: Array<{ key: string; source: string }>): {
  keys: KeyName[];
  handmadeKeys: KeyName[];
} {
  const keys = new Set<KeyName>();
  const handmade = new Set<KeyName>();
  for (const doc of docs) {
    const parsed = parseKey(doc.key);
    // Só aceita o nome canônico exato (parseKey normaliza "c" para "C", por exemplo).
    if (!parsed || parsed.name !== doc.key) continue;
    keys.add(parsed.name);
    if (doc.source === 'handmade') handmade.add(parsed.name);
  }
  return {
    keys: [...keys].sort(compareKeys),
    handmadeKeys: [...handmade].sort(compareKeys),
  };
}

export const onArrangementWritten = onDocumentWritten(
  { document: 'songs/{songId}/arrangements/{slug}', region: 'southamerica-east1' },
  async (event) => {
    const songRef = getFirestore().doc(`songs/${event.params.songId}`);
    if (!(await songRef.get()).exists) return;
    const snapshot = await songRef.collection('arrangements').get();
    const summary = summarizeArrangements(
      snapshot.docs.map((d) => ({
        key: String(d.data().key ?? ''),
        source: String(d.data().source ?? ''),
      })),
    );
    await songRef.set({ ...summary, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  },
);
