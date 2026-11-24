import { render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState, type MinistryRole } from '../auth/useAuth';
import { authStateFor } from '../test/authState';
import { PushProvider } from './PushProvider';
import { PushContext, type PushService } from './types';

function fakeService(): PushService {
  return {
    load: vi.fn<PushService['load']>(async () => 'available'),
    enable: vi.fn<PushService['enable']>(async () => 'active'),
    disable: vi.fn<PushService['disable']>(async () => 'available'),
    sendTest: vi.fn<PushService['sendTest']>(async () => 'sent'),
    revalidate: vi.fn<PushService['revalidate']>(async () => {}),
    forgetDevice: vi.fn<PushService['forgetDevice']>(async () => {}),
  };
}

/** Elegível: acesso liberado e vínculo no ministério (membro ou admin do ministério). */
function authOf(
  status: AuthState['status'],
  ministry: MinistryRole | null,
  access: AuthState['access'] = 'granted',
  appAdmin = false,
): AuthState {
  const base = authStateFor(ministry);
  return { ...base, status, user: status === 'signed-in' ? base.user : null, access, appAdmin };
}

function Probe() {
  const s = useContext(PushContext);
  return <p>{s ? 'com' : 'sem'}</p>;
}

function renderWith(service: PushService | null, auth: AuthState, children = <Probe />) {
  return render(
    <AuthContext.Provider value={auth}>
      <PushProvider service={service}>{children}</PushProvider>
    </AuthContext.Provider>,
  );
}

describe('PushProvider', () => {
  it('revalida uma vez para membro com sessão', () => {
    const service = fakeService();
    renderWith(service, authOf('signed-in', 'member'));
    expect(service.revalidate).toHaveBeenCalledTimes(1);
  });

  it('revalida uma vez para admin do ministério', () => {
    const service = fakeService();
    renderWith(service, authOf('signed-in', 'admin'));
    expect(service.revalidate).toHaveBeenCalledTimes(1);
  });

  it('não revalida para quem não tem ministério', () => {
    const service = fakeService();
    renderWith(service, authOf('signed-in', null));
    expect(service.revalidate).not.toHaveBeenCalled();
  });

  it('não revalida para admin da app sem ministério (sem avisos para ele)', () => {
    const service = fakeService();
    renderWith(service, authOf('signed-in', null, 'granted', true));
    expect(service.revalidate).not.toHaveBeenCalled();
  });

  it('does not revalidate while access is not granted', () => {
    const service = fakeService();
    renderWith(service, authOf('signed-in', 'member', 'blocked'));
    expect(service.revalidate).not.toHaveBeenCalled();
  });

  it('revalidates with access granted and ministry membership', () => {
    const service = fakeService();
    renderWith(service, authOf('signed-in', 'member', 'granted'));
    expect(service.revalidate).toHaveBeenCalledTimes(1);
  });

  it('não revalida sem sessão', () => {
    const service = fakeService();
    renderWith(service, authOf('signed-out', 'member'));
    expect(service.revalidate).not.toHaveBeenCalled();
  });

  it('sem serviço renderiza os filhos sem erro', () => {
    renderWith(null, authOf('signed-in', 'member'), <p>filho</p>);
    expect(screen.getByText('filho')).toBeInTheDocument();
  });

  it('expõe o serviço pelo contexto (com e sem serviço)', () => {
    const { unmount } = renderWith(fakeService(), authOf('signed-in', 'member'));
    expect(screen.getByText('com')).toBeInTheDocument();
    unmount();
    renderWith(null, authOf('signed-in', 'member'));
    expect(screen.getByText('sem')).toBeInTheDocument();
  });

  it('não repete a revalidação ao re-renderizar com o mesmo serviço', () => {
    const service = fakeService();
    const auth = authOf('signed-in', 'member');
    const { rerender } = renderWith(service, auth);
    rerender(
      <AuthContext.Provider value={auth}>
        <PushProvider service={service}>
          <Probe />
        </PushProvider>
      </AuthContext.Provider>,
    );
    expect(service.revalidate).toHaveBeenCalledTimes(1);
  });
});
