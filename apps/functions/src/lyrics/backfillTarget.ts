// Cabeçalho que o CLI de preenchimento imprime antes de gravar: deixa explícito
// em qual projeto, bucket e (se houver) emulador a execução vai atuar.
export type TargetInfo = {
  projectId: string | undefined;
  bucket?: string;
  dryRun: boolean;
  env: Record<string, string | undefined>;
};

const EMULATOR_VARS = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST'] as const;

export function describeTarget({ projectId, bucket, dryRun, env }: TargetInfo): {
  lines: string[];
  canProceed: boolean;
} {
  const resolved = Boolean(projectId);
  const lines = [
    `projeto: ${resolved ? projectId : '(não identificado)'}`,
    `modo: ${dryRun ? 'dry-run' : 'gravando'}`,
  ];
  if (bucket) lines.splice(1, 0, `bucket: ${bucket}`);
  for (const name of EMULATOR_VARS) {
    const value = env[name];
    if (value) lines.push(`${name}: ${value}`);
  }
  if (!resolved) {
    lines.push(
      'AVISO: não foi possível identificar o projeto do Firestore. ' +
        'Defina GOOGLE_CLOUD_PROJECT com o id do projeto.',
    );
    if (!dryRun) {
      lines.push(
        'Nada foi gravado: recusando gravar sem saber o projeto. Rode com --dry-run para conferir.',
      );
    }
  }
  return { lines, canProceed: resolved || dryRun };
}
