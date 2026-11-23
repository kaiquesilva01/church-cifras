import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isDirectRun } from './migrateCli';

const MODULE_PATH = fileURLToPath(new URL('./migrateCli.ts', import.meta.url));
const MODULE_URL = pathToFileURL(MODULE_PATH).href;

describe('isDirectRun', () => {
  it('é verdadeiro quando o arquivo executado é o próprio módulo', () => {
    expect(isDirectRun(MODULE_PATH, MODULE_URL)).toBe(true);
  });

  it('é falso quando o processo roda outro arquivo (ex.: o runner de testes)', () => {
    expect(isDirectRun(join(MODULE_PATH, '..', 'outro.mjs'), MODULE_URL)).toBe(false);
  });

  it('é falso sem argv[1] e com caminho inexistente', () => {
    expect(isDirectRun(undefined, MODULE_URL)).toBe(false);
    expect(isDirectRun(join(MODULE_PATH, '..', 'nao-existe.mjs'), MODULE_URL)).toBe(false);
  });
});
