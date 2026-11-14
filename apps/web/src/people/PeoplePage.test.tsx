import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import type { PeopleApi, PersonRow } from './peopleApi';
import { PeoplePage } from './PeoplePage';

const rows: PersonRow[] = [
  { uid: 'u1', displayName: 'Maria Souza', email: 'maria@example.com', role: 'admin' },
  { uid: 'u2', displayName: 'Kaique Silva', email: 'kaique@gmail.com', role: 'viewer' },
];

function fakeApi(overrides: Partial<PeopleApi> = {}): PeopleApi {
  return {
    listUsers: vi.fn(() => Promise.resolve(rows)),
    setRole: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function renderPage(api: PeopleApi) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: 'admin',
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  return render(
    <AuthContext.Provider value={auth}>
      <PeoplePage api={api} />
    </AuthContext.Provider>,
  );
}

describe('PeoplePage', () => {
  it('lists people with role labels', async () => {
    renderPage(fakeApi());
    expect(await screen.findByText('Kaique Silva')).toBeInTheDocument();
    expect(screen.getByText('k•••@gmail.com')).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Papel de Kaique Silva' });
    expect(select).toHaveValue('viewer');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Visitante', 'Membro', 'Admin']);
  });

  it('disables role select on own row and marks it (você)', async () => {
    renderPage(fakeApi());
    await screen.findByText('Kaique Silva');
    expect(screen.getByRole('combobox', { name: 'Papel de Maria Souza' })).toBeDisabled();
    expect(screen.getByText('(você)')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Papel de Kaique Silva' })).toBeEnabled();
  });

  it('changes role and shows confirmation', async () => {
    const api = fakeApi();
    renderPage(api);
    await screen.findByText('Kaique Silva');
    fireEvent.change(screen.getByRole('combobox', { name: 'Papel de Kaique Silva' }), {
      target: { value: 'member' },
    });
    expect(await screen.findByText('Papel atualizado')).toBeInTheDocument();
    expect(api.setRole).toHaveBeenCalledWith('u2', 'member');
    expect(screen.getByRole('combobox', { name: 'Papel de Kaique Silva' })).toHaveValue('member');
  });

  it('shows error and restores previous role when change fails', async () => {
    renderPage(fakeApi({ setRole: () => Promise.reject(new Error('nope')) }));
    await screen.findByText('Kaique Silva');
    fireEvent.change(screen.getByRole('combobox', { name: 'Papel de Kaique Silva' }), {
      target: { value: 'member' },
    });
    expect(await screen.findByText('Não foi possível alterar o papel.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Papel de Kaique Silva' })).toHaveValue('viewer');
  });

  it('shows empty state', async () => {
    renderPage(fakeApi({ listUsers: () => Promise.resolve([]) }));
    expect(await screen.findByText('Ninguém entrou ainda.')).toBeInTheDocument();
  });

  it('shows error when listing fails', async () => {
    renderPage(fakeApi({ listUsers: () => Promise.reject(new Error('x')) }));
    expect(await screen.findByText('Não foi possível carregar as pessoas.')).toBeInTheDocument();
    await act(async () => {});
  });
});
