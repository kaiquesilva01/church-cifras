import { describe, expect, it } from 'vitest';
import { decideInstallCard } from '../pwa/installPolicy';
import type { AvisosStatus } from './types';
import { AVISOS_RECORD_KEY, decideAvisosCard, isOfferStatus } from './avisosPolicy';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 23, 12);
const base = { canEdit: true, standalone: true, dismissedAt: null, now: NOW, sessionClosed: false };

describe('decideAvisosCard', () => {
  it('consulta o estado só para membro ou admin dentro do app instalado', () => {
    expect(decideAvisosCard(base)).toBe('check');
  });

  it('esconde para visitante e para a aba do navegador', () => {
    expect(decideAvisosCard({ ...base, canEdit: false })).toBe('hidden');
    expect(decideAvisosCard({ ...base, standalone: false })).toBe('hidden');
  });

  it('esconde por 30 dias depois de "Agora não", e volta depois', () => {
    expect(decideAvisosCard({ ...base, dismissedAt: NOW - 29 * DAY })).toBe('hidden');
    expect(decideAvisosCard({ ...base, dismissedAt: NOW - 30 * DAY })).toBe('check');
  });

  it('esconde pelo resto da sessão quando a sessão está fechada', () => {
    expect(decideAvisosCard({ ...base, sessionClosed: true })).toBe('hidden');
  });

  it('usa a própria chave versionada, diferente da do convite de instalação', () => {
    expect(AVISOS_RECORD_KEY).toBe('cifras.avisosCard.v1');
    expect(AVISOS_RECORD_KEY).not.toBe('cifras.installCard.v1');
  });

  it('nunca aparece junto do card de instalar, em nenhuma combinação de ambiente', () => {
    for (const standalone of [true, false]) {
      for (const iosSafari of [true, false]) {
        for (const hasPrompt of [true, false]) {
          const install = decideInstallCard({
            iosSafari,
            standalone,
            installed: false,
            dismissedAt: null,
            now: NOW,
            hasPrompt,
          });
          const avisos = decideAvisosCard({ ...base, standalone });
          expect(install !== 'hidden' && avisos === 'check').toBe(false);
        }
      }
    }
  });
});

describe('isOfferStatus', () => {
  it('oferece só com "disponível" ou "ativando" (o toque em andamento)', () => {
    expect(isOfferStatus('available')).toBe(true);
    expect(isOfferStatus('enabling')).toBe(true);
    const others: AvisosStatus[] = [
      'checking',
      'active',
      'disabling',
      'blocked',
      'ios-install',
      'unsupported',
      'error',
    ];
    for (const status of others) expect(isOfferStatus(status)).toBe(false);
  });
});
