import { act, fireEvent, render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';
import type { Role } from './roles';
import { createFakeGateway, testUser } from '../test/fakeGateway';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

function Probe() {
  const { status, role, access, signOut } = useAuth();
  return (
    <div>
      <span>status:{status}</span>
      <span>role:{role}</span>
      <span>access:{access}</span>
      <button onClick={() => void signOut()}>out</button>
    </div>
  );
}

function setup() {
  const gateway = createFakeGateway();
  render(
    <AuthProvider gateway={gateway}>
      <Probe />
    </AuthProvider>,
  );
  return gateway;
}

describe('AuthProvider', () => {
  it('starts loading then signed-out', () => {
    const gateway = setup();
    expect(screen.getByText('status:loading')).toBeInTheDocument();
    act(() => gateway.emitUser(null));
    expect(screen.getByText('status:signed-out')).toBeInTheDocument();
  });

  it('treats missing role as viewer and refreshes token when users doc changes', async () => {
    const gateway = setup();
    act(() => gateway.emitUser(testUser));
    act(() => gateway.emitRole(undefined));
    expect(screen.getByText('status:signed-in')).toBeInTheDocument();
    expect(screen.getByText('role:viewer')).toBeInTheDocument();
    await act(async () => gateway.emitRole('member'));
    expect(screen.getByText('role:member')).toBeInTheDocument();
    expect(gateway.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes token when first snapshot role differs from token claim', async () => {
    const gateway = setup();
    act(() => gateway.emitUser(testUser));
    await act(async () => gateway.emitRole('member'));
    expect(gateway.refreshToken).toHaveBeenCalledTimes(1);
    await act(async () => gateway.emitRole('member'));
    expect(gateway.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes again when role returns to a previous value', async () => {
    const gateway = setup();
    act(() => gateway.emitUser(testUser));
    await act(async () => gateway.emitRole('member'));
    await act(async () => gateway.emitRole('viewer'));
    await act(async () => gateway.emitRole('member'));
    // viewer -> member (3 syncs: the claim follows each role change via the fake refresh)
    expect(gateway.refreshToken).toHaveBeenCalledTimes(3);
  });

  it('does not refresh when claim already matches', async () => {
    const gateway = setup();
    gateway.claimRole = 'member';
    act(() => gateway.emitUser(testUser));
    await act(async () => gateway.emitRole('member'));
    expect(gateway.refreshToken).not.toHaveBeenCalled();
  });

  it('stays loading until the users doc arrives', () => {
    const gateway = setup();
    act(() => gateway.emitUser(testUser));
    expect(screen.getByText('status:loading')).toBeInTheDocument();
    act(() => gateway.emitRole(undefined));
    expect(screen.getByText('status:signed-in')).toBeInTheDocument();
  });

  it('signs out', () => {
    const gateway = setup();
    act(() => gateway.emitUser(testUser));
    fireEvent.click(screen.getByText('out'));
    expect(gateway.signOut).toHaveBeenCalledTimes(1);
  });

  describe('access (claim do token)', () => {
    it('access is checking until the claim is read', async () => {
      const gateway = setup();
      gateway.getClaimRole = () => new Promise(() => {});
      act(() => gateway.emitUser(testUser));
      await act(async () => gateway.emitRole('member'));
      expect(screen.getByText('access:checking')).toBeInTheDocument();
    });

    it('viewer claim is blocked', async () => {
      const gateway = setup();
      gateway.claimRole = 'viewer';
      await act(async () => gateway.emitUser(testUser));
      await act(async () => gateway.emitRole('viewer'));
      expect(screen.getByText('access:blocked')).toBeInTheDocument();
    });

    it.each<Role>(['member', 'admin'])('%s claim is granted', async (role) => {
      const gateway = setup();
      gateway.claimRole = role;
      await act(async () => gateway.emitUser(testUser));
      await act(async () => gateway.emitRole(role));
      expect(screen.getByText('access:granted')).toBeInTheDocument();
    });

    it('missing claim is blocked', async () => {
      const gateway = setup();
      gateway.claimRole = undefined;
      await act(async () => gateway.emitUser(testUser));
      await act(async () => gateway.emitRole(undefined));
      expect(screen.getByText('access:blocked')).toBeInTheDocument();
    });

    it('users doc says member but claim says viewer: refreshes token and grants', async () => {
      const gateway = setup();
      gateway.claimRole = 'viewer';
      await act(async () => gateway.emitUser(testUser));
      await act(async () => gateway.emitRole('viewer'));
      expect(screen.getByText('access:blocked')).toBeInTheDocument();
      await act(async () => gateway.emitRole('member'));
      expect(gateway.refreshToken).toHaveBeenCalledTimes(1);
      expect(screen.getByText('access:granted')).toBeInTheDocument();
    });

    it('demotion with app open turns blocked', async () => {
      const gateway = setup();
      gateway.claimRole = 'member';
      await act(async () => gateway.emitUser(testUser));
      await act(async () => gateway.emitRole('member'));
      expect(screen.getByText('access:granted')).toBeInTheDocument();
      await act(async () => gateway.emitRole('viewer'));
      expect(gateway.refreshToken).toHaveBeenCalledTimes(1);
      expect(screen.getByText('access:blocked')).toBeInTheDocument();
    });

    it('failed claim read is blocked and warns', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const gateway = setup();
      gateway.getClaimRole = () => Promise.reject(new Error('rede'));
      await act(async () => gateway.emitUser(testUser));
      await act(async () => gateway.emitRole('member'));
      expect(screen.getByText('access:blocked')).toBeInTheDocument();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
