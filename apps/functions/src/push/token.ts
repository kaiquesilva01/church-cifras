import { createHash } from 'node:crypto';

export const ORIGINS = ['producao', 'teste'] as const;
export type Origin = (typeof ORIGINS)[number];

export const SITE_BASE: Record<Origin, string> = {
  producao: 'https://louvor-hajaluz.web.app',
  teste: 'https://louvor-hajaluz-teste.web.app',
};

export function parseOrigin(value: unknown): Origin | null {
  return ORIGINS.find((origin) => origin === value) ?? null;
}

// Aparelho sem origem gravada (ou com valor desconhecido) é de produção.
export function deviceOrigin(value: unknown): Origin {
  return parseOrigin(value) ?? 'producao';
}

/** Id do documento em `pushDevices`: SHA-256 em hex do token. */
export function deviceId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Identificador curto do aparelho para logs (nunca o token). */
export function shortHash(token: string): string {
  return deviceId(token).slice(0, 8);
}
