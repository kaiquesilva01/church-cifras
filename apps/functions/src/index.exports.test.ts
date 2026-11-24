import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8');

describe('exportações do pacote de ministérios', () => {
  it('não exporta o espelho, setUserRole nem o gatilho antigo', () => {
    expect(src).not.toMatch(/mirrorSetlists/);
    expect(src).not.toMatch(/export const setUserRole/);
    expect(src).not.toMatch(/\bonSetlistWritten\b/);
    expect(src).toMatch(/onMinistrySetlistWritten/);
  });
  it('confere papel por guards, não por requireRole', () => {
    expect(src).not.toMatch(/requireRole\(/);
    expect(src).not.toMatch(/getStatsForAdmin/);
    expect(src).toMatch(/requireAppAdmin\(guardDeps/);
    expect(src).toMatch(/requireUploader\(guardDeps/);
    expect(src).toMatch(/requireCatalogContributor\(guardDeps/);
    expect(src).toMatch(/getStatsForCaller\(/);
  });
});
