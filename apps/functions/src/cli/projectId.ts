import type { Firestore } from 'firebase-admin/firestore';

// O id que o Firestore de fato vai usar (explícito ou detectado pelo ADC).
export async function resolveProjectId(db: Firestore): Promise<string | undefined> {
  const read = () => {
    try {
      // `projectId` existe em runtime mas não está nos tipos publicados.
      return (db as unknown as { projectId?: string }).projectId || undefined;
    } catch {
      return undefined; // cliente ainda não inicializou
    }
  };
  const direct = read();
  if (direct) return direct;
  try {
    await db.collection('songs').limit(1).get(); // força a detecção do projeto
  } catch {
    // sem credenciais ou sem acesso: o projeto segue não identificado
  }
  return read();
}
