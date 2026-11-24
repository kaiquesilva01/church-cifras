import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeGateway, testUser, type FakeGateway } from '../test/fakeGateway';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

const NONE = { appAdmin: false, hasMinistry: false, canUploadSong: false };

function Probe() {
  const a = useAuth();
  const state = JSON.stringify({
    access: a.access,
    appAdmin: a.appAdmin,
    canUploadSong: a.canUploadSong,
    ministry: a.ministry,
    status: a.status,
    keys: Object.keys(a),
  });
  return (
    <div>
      <output data-testid="auth">{state}</output>
      <button onClick={() => void a.signOut()}>out</button>
    </div>
  );
}

function read(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('auth').textContent ?? '{}') as Record<string, unknown>;
}

function setup(): FakeGateway {
  const gateway = createFakeGateway();
  render(
    <AuthProvider gateway={gateway}>
      <Probe />
    </AuthProvider>,
  );
  return gateway;
}

/** Entra com o usuário de teste e deixa as promessas de claims resolverem. */
// Cada emissão em um act próprio: o provedor só assina perfil e vínculos depois de renderizar o usuário.
async function enter(gateway: FakeGateway, appAdmin = false) {
  await act(async () => gateway.emitUser(testUser));
  await act(async () => gateway.emitProfile({ appAdmin }));
}

describe('AuthProvider', () => {
  it('starts loading then signed-out', () => {
    const gateway = setup();
    expect(read().status).toBe('loading');
    act(() => gateway.emitUser(null));
    expect(read().status).toBe('signed-out');
  });

  it('signs out', async () => {
    const gateway = setup();
    await enter(gateway);
    fireEvent.click(screen.getByText('out'));
    expect(gateway.signOut).toHaveBeenCalledTimes(1);
  });

  it('does not expose role in the auth state', async () => {
    const gateway = setup();
    await enter(gateway);
    expect(read().keys).not.toContain('role');
  });

  it('access is checking until the claims are read', async () => {
    const gateway = setup();
    gateway.getClaims = () => new Promise(() => {});
    await enter(gateway);
    expect(read().access).toBe('checking');
  });

  it('1. sem vínculo e sem claim: access blocked e ministry null', async () => {
    const gateway = setup();
    gateway.claims = NONE;
    await enter(gateway);
    act(() => gateway.emitMemberships([]));
    await act(async () => undefined);
    expect(read().access).toBe('blocked');
    expect(read().ministry).toBeNull();
  });

  it('2. vínculo observado e claim hasMinistry falso: refresh uma vez e relê os claims', async () => {
    const gateway = setup();
    gateway.claims = NONE;
    gateway.nextClaims = { appAdmin: false, hasMinistry: true, canUploadSong: false };
    await enter(gateway);
    await act(async () => gateway.emitMemberships([{ ministryId: 'hajaluz', role: 'member' }]));
    expect(gateway.refreshToken).toHaveBeenCalledTimes(1);
    expect(read().access).toBe('granted');
  });

  it('3. claim hasMinistry verdadeiro: ministry com name e city do documento', async () => {
    const gateway = setup();
    gateway.claims = { appAdmin: false, hasMinistry: true, canUploadSong: false };
    await enter(gateway);
    await act(async () => gateway.emitMemberships([{ ministryId: 'hajaluz', role: 'admin' }]));
    act(() => gateway.emitMinistry({ name: 'Haja Luz', city: 'São Paulo' }));
    expect(read().ministry).toEqual({
      id: 'hajaluz',
      name: 'Haja Luz',
      city: 'São Paulo',
      role: 'admin',
    });
  });

  it('4. appAdmin sem vínculo: granted e ministry null', async () => {
    const gateway = setup();
    gateway.claims = { appAdmin: true, hasMinistry: false, canUploadSong: true };
    await enter(gateway, true);
    await act(async () => gateway.emitMemberships([]));
    expect(read().access).toBe('granted');
    expect(read().ministry).toBeNull();
    expect(read().appAdmin).toBe(true);
  });

  it('5. vínculo que some: forgetLocalData chamado uma vez com o nome do ministério', async () => {
    const gateway = setup();
    gateway.claims = { appAdmin: false, hasMinistry: true, canUploadSong: false };
    await enter(gateway);
    await act(async () => gateway.emitMemberships([{ ministryId: 'hajaluz', role: 'member' }]));
    act(() => gateway.emitMinistry({ name: 'Haja Luz', city: 'São Paulo' }));
    await act(async () => gateway.emitMemberships([]));
    expect(gateway.forgetLocalData).toHaveBeenCalledTimes(1);
    expect(gateway.forgetLocalData).toHaveBeenCalledWith('Haja Luz');
  });

  it('6. vínculo que aparece não limpa o cache', async () => {
    const gateway = setup();
    await enter(gateway);
    await act(async () => gateway.emitMemberships([{ ministryId: 'hajaluz', role: 'member' }]));
    expect(gateway.forgetLocalData).not.toHaveBeenCalled();
  });

  it('claim divergente do appAdmin do documento: refresh e relê', async () => {
    const gateway = setup();
    gateway.claims = NONE;
    gateway.nextClaims = { appAdmin: true, hasMinistry: false, canUploadSong: true };
    await enter(gateway, true);
    await act(async () => gateway.emitMemberships([]));
    expect(gateway.refreshToken).toHaveBeenCalledTimes(1);
    expect(read().access).toBe('granted');
  });

  it('falha ao ler os vínculos: não tenta renovar o token e avisa', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const gateway = setup();
    gateway.claims = NONE;
    gateway.nextClaims = { appAdmin: false, hasMinistry: true, canUploadSong: false };
    gateway.onMemberships = (_uid, _cb, onError) => {
      onError(new Error('rede'));
      return () => undefined;
    };
    await enter(gateway);
    await act(async () => undefined);
    expect(gateway.refreshToken).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Falha ao ler os vínculos', expect.any(Error));
    warn.mockRestore();
  });

  describe('atualização do token com espera crescente', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('8. claim que não chega: tenta de novo com espera crescente e para em 6 leituras', async () => {
      const gateway = setup();
      gateway.claims = NONE;
      gateway.nextClaims = NONE;
      await enter(gateway);
      await act(async () => gateway.emitMemberships([{ ministryId: 'hajaluz', role: 'member' }]));
      expect(gateway.refreshToken).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(gateway.refreshToken).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000 + 16000 + 60000);
      });
      expect(gateway.refreshToken).toHaveBeenCalledTimes(6);
    });
  });
});
