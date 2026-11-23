import { vi } from 'vitest';
import type { AvisosStatus, PushService } from '../push/types';

/** Serviço de avisos falso para testes de componente. Cada método é um `vi.fn`; o teste sobrescreve o que precisa. */
export function fakePushService(overrides: Partial<PushService> = {}): PushService {
  return {
    load: vi.fn(async () => 'available' as AvisosStatus),
    enable: vi.fn(async () => 'active' as AvisosStatus),
    disable: vi.fn(async () => 'available' as AvisosStatus),
    sendTest: vi.fn(async () => 'sent' as const),
    revalidate: vi.fn(async () => {}),
    forgetDevice: vi.fn(async () => {}),
    ...overrides,
  };
}
