import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { avisosSession } from './avisosSession';
import type { AvisosStatus, PushService } from './types';
import { usePushAvisos } from './usePushAvisos';

function service(overrides: Partial<PushService> = {}): PushService {
  return {
    load: vi.fn(async () => 'available' as AvisosStatus),
    enable: vi.fn(async () => 'active' as const),
    disable: vi.fn(async () => 'available' as const),
    sendTest: vi.fn(async () => 'sent' as const),
    revalidate: vi.fn(async () => {}),
    forgetDevice: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('usePushAvisos', () => {
  it('starts as checking and settles on the loaded status', async () => {
    const s = service();
    const { result } = renderHook(() => usePushAvisos(s));
    expect(result.current.status).toBe('checking');
    await waitFor(() => expect(result.current.status).toBe('available'));
  });

  it('enable goes to enabling in the same call as the tap (no await before getToken)', async () => {
    const s = service({ enable: vi.fn(() => new Promise<AvisosStatus>(() => {})) });
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('available'));
    act(() => result.current.enable());
    expect(result.current.status).toBe('enabling');
    expect(s.enable).toHaveBeenCalledTimes(1);
  });

  it('enable resolving active sets active', async () => {
    const s = service();
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('available'));
    await act(async () => result.current.enable());
    expect(result.current.status).toBe('active');
  });

  it('disable clears a previous test result to idle', async () => {
    const s = service({ sendTest: vi.fn(async () => 'failed' as const) });
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('available'));
    await act(async () => result.current.sendTest());
    expect(result.current.test).toBe('failed');
    await act(async () => result.current.disable());
    expect(result.current.test).toBe('idle');
  });

  it('a failed test reloads the status from the service', async () => {
    const s = service({
      sendTest: vi.fn(async () => 'failed' as const),
      load: vi.fn().mockResolvedValueOnce('active').mockResolvedValue('available'),
    });
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('active'));
    await act(async () => result.current.sendTest());
    expect(result.current.test).toBe('failed');
    expect(s.load).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('available');
  });

  it('a sent test does not reload the status', async () => {
    const s = service({ sendTest: vi.fn(async () => 'sent' as const) });
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('available'));
    await act(async () => result.current.sendTest());
    expect(s.load).toHaveBeenCalledTimes(1);
    expect(result.current.test).toBe('sent');
  });

  it('enable rejecting sets error', async () => {
    const s = service({ enable: vi.fn(() => Promise.reject(new Error('boom'))) });
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('available'));
    await act(async () => result.current.enable());
    expect(result.current.status).toBe('error');
  });

  it('retry from error reloads the status and never calls enable', async () => {
    const s = service({
      enable: vi.fn(() => Promise.reject(new Error('boom'))),
      load: vi.fn().mockResolvedValueOnce('available').mockResolvedValue('available'),
    });
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('available'));
    await act(async () => result.current.enable());
    expect(result.current.status).toBe('error');
    const loadsBefore = vi.mocked(s.load).mock.calls.length;
    await act(async () => result.current.retry());
    expect(s.load).toHaveBeenCalledTimes(loadsBefore + 1);
    expect(s.enable).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('available');
  });

  it('retry shows checking while load is pending', async () => {
    let resolveLoad: (status: AvisosStatus) => void = () => {};
    const s = service({
      enable: vi.fn(() => Promise.reject(new Error('boom'))),
      load: vi
        .fn()
        .mockResolvedValueOnce('available')
        .mockImplementation(() => new Promise<AvisosStatus>((resolve) => (resolveLoad = resolve))),
    });
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('available'));
    await act(async () => result.current.enable());
    act(() => result.current.retry());
    expect(result.current.status).toBe('checking');
    await act(async () => resolveLoad('ios-install'));
    expect(result.current.status).toBe('ios-install');
  });

  it('a failed test keeps a status changed meanwhile (disabling) when the reload resolves', async () => {
    let resolveReload: (status: AvisosStatus) => void = () => {};
    const s = service({
      sendTest: vi.fn(async () => 'failed' as const),
      load: vi
        .fn()
        .mockResolvedValueOnce('active')
        .mockImplementation(
          () => new Promise<AvisosStatus>((resolve) => (resolveReload = resolve)),
        ),
      disable: vi.fn(() => new Promise<AvisosStatus>(() => {})),
    });
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('active'));
    act(() => result.current.sendTest());
    await waitFor(() => expect(result.current.test).toBe('failed'));
    act(() => result.current.disable());
    expect(result.current.status).toBe('disabling');
    await act(async () => resolveReload('available'));
    expect(result.current.status).toBe('disabling');
  });

  it('a failed test whose reload rejects keeps the status and the failed result', async () => {
    const s = service({
      sendTest: vi.fn(async () => 'failed' as const),
      load: vi.fn().mockResolvedValueOnce('active').mockRejectedValue(new Error('offline')),
    });
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('active'));
    await act(async () => result.current.sendTest());
    expect(result.current.test).toBe('failed');
    expect(result.current.status).toBe('active');
  });

  it('enable clears the test result to idle', async () => {
    const s = service({ sendTest: vi.fn(async () => 'sent' as const) });
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('available'));
    await act(async () => result.current.sendTest());
    expect(result.current.test).toBe('sent');
    await act(async () => result.current.enable());
    expect(result.current.test).toBe('idle');
  });

  it('desativar fecha a sessão do convite, para ele não voltar agora', async () => {
    avisosSession.reset();
    const s = service();
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('available'));
    await act(async () => {
      result.current.disable();
    });
    expect(avisosSession.isClosed()).toBe(true);
    avisosSession.reset();
  });
});
