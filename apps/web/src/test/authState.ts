import { act } from '@testing-library/react';
import type { MinistryRole } from '../auth/useAuth';
import { testUser, type FakeGateway } from './fakeGateway';

export type Scenario = {
  appAdmin?: boolean;
  canUploadSong?: boolean;
  /** Sem `ministry`: a pessoa não tem vínculo. */
  ministry?: { id?: string; name?: string; city?: string; role?: MinistryRole };
};

/** Entra como `testUser` com o estado descrito (claims, perfil, vínculo e documento do ministério). */
export function signInAs(gateway: FakeGateway, scenario: Scenario = {}): void {
  const m = scenario.ministry;
  const appAdmin = scenario.appAdmin === true;
  // Claims antes de entrar: o provedor lê os claims ao receber o usuário.
  gateway.claims = {
    appAdmin,
    hasMinistry: m !== undefined,
    canUploadSong: scenario.canUploadSong ?? (appAdmin || m?.role === 'admin'),
  };
  // Cada emissão em seu act: o provedor só assina perfil e vínculos depois de renderizar o usuário.
  act(() => gateway.emitUser(testUser));
  act(() => gateway.emitProfile({ appAdmin }));
  act(() =>
    gateway.emitMemberships(m ? [{ ministryId: m.id ?? 'hajaluz', role: m.role ?? 'member' }] : []),
  );
  // Em outro act: o provedor só assina onMinistry depois de ter o vínculo renderizado.
  act(() =>
    gateway.emitMinistry(m ? { name: m.name ?? 'Haja Luz', city: m.city ?? 'São Paulo' } : null),
  );
}
