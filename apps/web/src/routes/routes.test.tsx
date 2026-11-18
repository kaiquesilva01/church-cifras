import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import type { Role } from '../auth/roles';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import { createFakeGateway, testUser } from '../test/fakeGateway';
import { fakeSetlistApi } from '../test/fakeSetlistApi';
import type { PeopleApi } from '../people/peopleApi';

const peopleApi: PeopleApi = {
  listUsers: () => Promise.resolve([]),
  setRole: () => Promise.resolve(),
};

function setup(path: string, signedIn?: Role) {
  const gateway = createFakeGateway();
  render(
    <App
      gateway={gateway}
      peopleApi={peopleApi}
      catalogApi={fakeCatalogApi()}
      setlistApi={fakeSetlistApi()}
      initialPath={path}
    />,
  );
  act(() => gateway.emitUser(signedIn ? testUser : null));
  if (signedIn) act(() => gateway.emitRole(signedIn));
  return gateway;
}

describe('routes', () => {
  it('redirects signed-out user to login', () => {
    setup('/');
    expect(screen.getByText('Entrar com Google')).toBeInTheDocument();
  });

  it('login explains that new people start as visitors', () => {
    setup('/login');
    expect(
      screen.getByText('Quem entra pela primeira vez começa como visitante.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Cifras · Louvor' })).toBeInTheDocument();
  });

  it('login screen warms the sign-in popup on mount', () => {
    const gateway = setup('/login');
    expect(gateway.prepareSignIn).toHaveBeenCalledTimes(1);
  });

  it('login button calls signIn', () => {
    const gateway = setup('/login');
    fireEvent.click(screen.getByText('Entrar com Google'));
    expect(gateway.signIn).toHaveBeenCalledTimes(1);
  });

  it('shows error when signIn fails', async () => {
    const gateway = createFakeGateway();
    gateway.signIn = () => Promise.reject(new Error('popup'));
    render(
      <App
        gateway={gateway}
        peopleApi={peopleApi}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        initialPath="/login"
      />,
    );
    act(() => gateway.emitUser(null));
    fireEvent.click(screen.getByText('Entrar com Google'));
    expect(await screen.findByText('Não foi possível entrar. Tente de novo.')).toBeInTheDocument();
  });

  it.each(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])(
    'shows no error when the popup is dismissed (%s)',
    async (code) => {
      const gateway = createFakeGateway();
      gateway.signIn = () => Promise.reject(Object.assign(new Error('popup'), { code }));
      render(
        <App
          gateway={gateway}
          peopleApi={peopleApi}
          catalogApi={fakeCatalogApi()}
          setlistApi={fakeSetlistApi()}
          initialPath="/login"
        />,
      );
      act(() => gateway.emitUser(null));
      fireEvent.click(screen.getByText('Entrar com Google'));
      await waitFor(() => expect(screen.getByText('Entrar com Google')).toBeEnabled());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('shows home for signed-in viewer without Pessoas link', () => {
    setup('/', 'viewer');
    expect(screen.getByRole('searchbox', { name: 'Buscar música ou cantor…' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pessoas' })).not.toBeInTheDocument();
  });

  it('shows the Admin link (to Pessoas) in Mais for admin only', () => {
    setup('/mais', 'admin');
    expect(screen.getByRole('link', { name: /Admin/ })).toHaveAttribute('href', '/pessoas');
    cleanup();
    setup('/mais', 'member');
    expect(screen.queryByRole('link', { name: /Admin/ })).not.toBeInTheDocument();
  });

  it('redirects non-admin away from /pessoas', () => {
    setup('/pessoas', 'member');
    expect(screen.getByRole('searchbox', { name: 'Buscar música ou cantor…' })).toBeInTheDocument();
  });

  it('RequireRole allows listed roles and redirects others', () => {
    setup('/pessoas', 'admin');
    expect(screen.getByRole('heading', { name: 'Pessoas' })).toBeInTheDocument();
    cleanup();
    setup('/pessoas', 'viewer');
    expect(screen.queryByRole('heading', { name: 'Pessoas' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar música ou cantor…' })).toBeInTheDocument();
  });

  it('waits for the role before deciding on /pessoas', () => {
    const gateway = createFakeGateway();
    render(
      <App
        gateway={gateway}
        peopleApi={peopleApi}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        initialPath="/pessoas"
      />,
    );
    act(() => gateway.emitUser(testUser));
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    act(() => gateway.emitRole('admin'));
    expect(screen.getByRole('heading', { name: 'Pessoas' })).toBeInTheDocument();
  });

  it('disables the login button while the popup is open', () => {
    const gateway = createFakeGateway();
    gateway.signIn = () => new Promise(() => undefined);
    render(
      <App
        gateway={gateway}
        peopleApi={peopleApi}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        initialPath="/login"
      />,
    );
    act(() => gateway.emitUser(null));
    fireEvent.click(screen.getByText('Entrar com Google'));
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeDisabled();
  });

  it('Mais shows the role label and Sair', () => {
    const gateway = setup('/mais', 'member');
    expect(screen.getByText('Membro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sair/ }));
    expect(gateway.signOut).toHaveBeenCalledTimes(1);
  });

  it('shows the bottom bar on the root screens and hides it on details', () => {
    setup('/', 'member');
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    cleanup();
    setup('/nova', 'member');
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  });
});
