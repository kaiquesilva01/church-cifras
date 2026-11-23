import { defineConfig } from 'tsup';

// CLI de migração dos ministérios (src/ministries/migrateCli.ts). Não entra no bundle das Functions:
// clean: false para nunca apagar lib/index.js (o que está publicado); firebase-admin e
// firebase-functions ficam de fora do bundle.
export default defineConfig({
  entry: ['src/ministries/migrateCli.ts'],
  outDir: 'lib',
  format: ['esm'],
  target: 'node22',
  clean: false,
  noExternal: [/^@cifras\//],
  external: ['firebase-admin', 'firebase-functions'],
});
