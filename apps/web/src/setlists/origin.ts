import type { SetlistOrigin } from './types';

/** Host do site de teste (o mesmo de `SITE_BASE.teste` nas Functions). */
export const TEST_SITE_HOST = 'louvor-hajaluz-teste.web.app';

/** Origem gravada no repertório e no aparelho: `teste` só no site de teste; o resto é `producao`. */
export function originForHostname(hostname: string): SetlistOrigin {
  return hostname === TEST_SITE_HOST ? 'teste' : 'producao';
}

export function parseOrigin(value: unknown): SetlistOrigin | null {
  return value === 'producao' || value === 'teste' ? value : null;
}
