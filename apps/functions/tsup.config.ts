import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['cjs'],
  target: 'node22',
  clean: true,
  noExternal: [/^@cifras\//],
});
