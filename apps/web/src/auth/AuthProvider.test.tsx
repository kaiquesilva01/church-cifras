import { act, fireEvent, render, screen } from '@testing-library/react';

import { describe, expect, it } from 'vitest';
import { createFakeGateway, testUser } from '../test/fakeGateway';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

function Probe() {
  const { status, role, signOut } = useAuth();
  return (
    <div>
      <span>status:{status}</span>
      <span>role:{role}</span>
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

  it('treats missing role as viewer and refreshes token when users doc changes', () => {
    const gateway = setup();
    act(() => gateway.emitUser(testUser));
    act(() => gateway.emitRole(undefined));
    expect(screen.getByText('status:signed-in')).toBeInTheDocument();
    expect(screen.getByText('role:viewer')).toBeInTheDocument();
    act(() => gateway.emitRole('member'));
    expect(screen.getByText('role:member')).toBeInTheDocument();
    expect(gateway.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('signs out', () => {
    const gateway = setup();
    act(() => gateway.emitUser(testUser));
    fireEvent.click(screen.getByText('out'));
    expect(gateway.signOut).toHaveBeenCalledTimes(1);
  });
});
