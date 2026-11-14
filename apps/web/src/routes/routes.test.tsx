import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import type { Role } from '../auth/roles';
import { createFakeGateway, testUser } from '../test/fakeGateway';

function setup(path: string, signedIn?: Role) {
  const gateway = createFakeGateway();
  render(<App gateway={gateway} initialPath={path} />);
  act(() => gateway.emitUser(signedIn ? testUser : null));
  if (signedIn) act(() => gateway.emitRole(signedIn));
  return gateway;
}

describe('routes', () => {
  it('redirects signed-out user to login', () => {
    setup('/');
    expect(screen.getByText('Entrar com Google')).toBeInTheDocument();
  });

  it('login button calls signIn', () => {
    const gateway = setup('/login');
    fireEvent.click(screen.getByText('Entrar com Google'));
    expect(gateway.signIn).toHaveBeenCalledTimes(1);
  });

  it('shows error when signIn fails', async () => {
    const gateway = createFakeGateway();
    gateway.signIn = () => Promise.reject(new Error('popup'));
    render(<App gateway={gateway} initialPath="/login" />);
    act(() => gateway.emitUser(null));
    fireEvent.click(screen.getByText('Entrar com Google'));
    expect(await screen.findByText('Não foi possível entrar. Tente de novo.')).toBeInTheDocument();
  });

  it('shows home for signed-in viewer without Pessoas link', () => {
    setup('/', 'viewer');
    expect(screen.getByText('Olá, Maria')).toBeInTheDocument();
    expect(screen.getByText('A busca de cifras chega em breve.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pessoas' })).not.toBeInTheDocument();
  });

  it('shows Pessoas link for admin', () => {
    setup('/', 'admin');
    expect(screen.getByRole('link', { name: 'Pessoas' })).toBeInTheDocument();
  });

  it('redirects non-admin away from /pessoas', () => {
    setup('/pessoas', 'member');
    expect(screen.getByText('Olá, Maria')).toBeInTheDocument();
  });

  it('waits for the role before deciding on /pessoas', () => {
    const gateway = createFakeGateway();
    render(<App gateway={gateway} initialPath="/pessoas" />);
    act(() => gateway.emitUser(testUser));
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    act(() => gateway.emitRole('admin'));
    expect(screen.getByRole('heading', { name: 'Pessoas' })).toBeInTheDocument();
  });

  it('disables the login button while the popup is open', () => {
    const gateway = createFakeGateway();
    gateway.signIn = () => new Promise(() => undefined);
    render(<App gateway={gateway} initialPath="/login" />);
    act(() => gateway.emitUser(null));
    fireEvent.click(screen.getByText('Entrar com Google'));
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeDisabled();
  });

  it('header shows role label and Sair', () => {
    const gateway = setup('/', 'member');
    expect(screen.getByText('Membro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(gateway.signOut).toHaveBeenCalledTimes(1);
  });
});
