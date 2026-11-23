import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { INSTALL_RECORD_KEY } from '../pwa/installPolicy';
import { testUser } from '../test/fakeGateway';
import { fakePushService } from '../test/fakePushService';
import { AVISOS_RECORD_KEY } from './avisosPolicy';
import { AvisosCard } from './AvisosCard';
import { createAvisosSession, type AvisosSession } from './avisosSession';
import { PushContext, type AvisosStatus, type PushService } from './types';

const DAY = 24 * 60 * 60 * 1000;

/** `display-mode: standalone` verdadeiro ou falso (jsdom não tem matchMedia). */
function standalone(on: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: on && query === '(display-mode: standalone)' }),
  });
}

function auth(role: Role): AuthState {
  return {
    status: 'signed-in',
    user: testUser,
    role,
    access: 'granted',
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
}

function renderCard(
  service: PushService | null,
  role: Role = 'member',
  session: AvisosSession = createAvisosSession(),
) {
  return render(
    <AuthContext.Provider value={auth(role)}>
      <PushContext.Provider value={service}>
        <AvisosCard session={session} />
      </PushContext.Provider>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  standalone(true);
});

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('AvisosCard', () => {
  it('não renderiza nada sem serviço de avisos (sem VAPID)', () => {
    const { container } = renderCard(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('nunca consulta o estado para visitante', () => {
    const service = fakePushService();
    const { container } = renderCard(service, 'viewer');
    expect(container).toBeEmptyDOMElement();
    expect(service.load).not.toHaveBeenCalled();
  });

  it('nunca consulta o estado fora do app instalado', () => {
    standalone(false);
    const service = fakePushService();
    const { container } = renderCard(service);
    expect(container).toBeEmptyDOMElement();
    expect(service.load).not.toHaveBeenCalled();
  });

  it('nunca consulta o estado enquanto dispensado por 30 dias', () => {
    localStorage.setItem(AVISOS_RECORD_KEY, JSON.stringify({ dismissedAt: Date.now() - DAY }));
    const service = fakePushService();
    const { container } = renderCard(service);
    expect(container).toBeEmptyDOMElement();
    expect(service.load).not.toHaveBeenCalled();
  });

  it('fica vazio enquanto verifica e aparece com o estado disponível', async () => {
    let answer!: (status: AvisosStatus) => void;
    const service = fakePushService({
      load: vi.fn(() => new Promise<AvisosStatus>((resolve) => (answer = resolve))),
    });
    renderCard(service);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    await act(async () => answer('available'));
    expect(screen.getByRole('region', { name: 'Ative os avisos' })).toBeInTheDocument();
    expect(screen.getByText('Repertório novo e lembrete do ensaio')).toBeInTheDocument();
  });

  it('o toque chama enable na mesma chamada, e o segundo toque não pede de novo', async () => {
    const service = fakePushService({
      enable: vi.fn(() => new Promise<AvisosStatus>(() => {})),
    });
    renderCard(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
    expect(service.enable).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole('button', { name: 'Ativando…' });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(service.enable).toHaveBeenCalledTimes(1);
  });

  it('sucesso: o cartão some, o aviso de teste sai uma vez e a sessão fecha', async () => {
    const service = fakePushService({ enable: vi.fn(async () => 'active' as const) });
    const session = createAvisosSession();
    renderCard(service, 'member', session);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
    await waitFor(() => expect(service.sendTest).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(session.isClosed()).toBe(true);
  });

  it.each(['blocked', 'error'] as const)(
    'desfecho "%s" some e não volta ao remontar na mesma sessão, sem mensagem nova',
    async (outcome) => {
      const service = fakePushService({ enable: vi.fn(async () => outcome) });
      const session = createAvisosSession();
      const { unmount } = renderCard(service, 'member', session);
      fireEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
      await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
      expect(service.sendTest).not.toHaveBeenCalled();
      unmount();

      renderCard(service, 'member', session);
      await waitFor(() => expect(service.load).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('"Agora não" grava a chave própria por 30 dias e não mexe na do convite de instalação', async () => {
    renderCard(fakePushService());
    fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(AVISOS_RECORD_KEY) ?? 'null')).toEqual({
      dismissedAt: expect.any(Number),
    });
    expect(localStorage.getItem(INSTALL_RECORD_KEY)).toBeNull();
  });

  it('sem armazenamento, "Agora não" ainda esconde o cartão nesta sessão', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    const session = createAvisosSession();
    renderCard(fakePushService(), 'member', session);
    fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(session.isClosed()).toBe(true);
  });
});
