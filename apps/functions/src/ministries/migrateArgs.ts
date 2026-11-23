import { parseArgs } from 'node:util';

// Argumentos do CLI de migração (tarefa 11). Parte pura, sem Firebase, para ser testada.
export const MIGRATE_USAGE =
  'Uso: npm run ministries:migrate -- [--dry-run] [--app-admin <e-mail>]';

export type MigrateArgs = { dryRun: boolean; appAdminEmail: string | undefined };

export function parseMigrateArgs(argv: string[]): MigrateArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean', default: false },
      'app-admin': { type: 'string' },
    },
  });
  let appAdminEmail: string | undefined;
  if (values['app-admin'] !== undefined) {
    // Em branco não é "sem admin" nem uma busca por vazio: é erro de uso.
    const trimmed = values['app-admin'].trim();
    if (!trimmed) {
      throw new Error(`--app-admin precisa de um e-mail. ${MIGRATE_USAGE}`);
    }
    appAdminEmail = trimmed;
  }
  return { dryRun: values['dry-run'], appAdminEmail };
}
