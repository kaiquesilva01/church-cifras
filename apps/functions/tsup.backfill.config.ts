import { defineConfig } from 'tsup';

// CLI de preenchimento de letras (src/lyrics/backfillCli.ts). Não entra no bundle das Functions:
// clean: false para nunca apagar lib/index.js (o que está publicado); pdf.js e firebase-admin
// ficam de fora do bundle.
export default defineConfig({
  entry: ['src/lyrics/backfillCli.ts'],
  outDir: 'lib',
  format: ['esm'],
  target: 'node22',
  clean: false,
  noExternal: [/^@cifras\//],
  external: ['pdfjs-dist', 'firebase-admin'],
});
