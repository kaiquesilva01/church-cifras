import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import { toPersonRow, type PeopleApi, type PersonRow } from './peopleApi';
import { PeoplePage, maskEmail } from './PeoplePage';

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
    prepareSignIn: () => Promise.resolve(),
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

  it('falls back to the masked email when displayName is empty', async () => {
    renderPage(
      fakeApi({
        listUsers: vi.fn(() =>
          Promise.resolve([
            { uid: 'u3', displayName: '', email: 'ana@example.com', role: 'viewer' as const },
          ]),
        ),
      }),
    );
    expect(
      await screen.findByRole('combobox', { name: 'Papel de a•••@example.com' }),
    ).toBeEnabled();
    expect(screen.getAllByText('a•••@example.com')).toHaveLength(2);
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível alterar o papel.');
    expect(screen.getByRole('combobox', { name: 'Papel de Kaique Silva' })).toHaveValue('viewer');
  });

  it('disables the row while its change is pending', async () => {
    let resolve!: () => void;
    const api = fakeApi({ setRole: () => new Promise<void>((r) => (resolve = r)) });
    renderPage(api);
    await screen.findByText('Kaique Silva');
    const select = screen.getByRole('combobox', { name: 'Papel de Kaique Silva' });
    fireEvent.change(select, { target: { value: 'member' } });
    expect(select).toBeDisabled();
    resolve();
    expect(await screen.findByText('Papel atualizado')).toBeInTheDocument();
    expect(select).toBeEnabled();
  });

  it.each([
    ['functions/not-found', 'Essa pessoa não existe mais.'],
    ['functions/permission-denied', 'Você não tem permissão para alterar papéis.'],
    ['functions/failed-precondition', 'Você não pode alterar o próprio papel.'],
    ['functions/internal', 'Não foi possível alterar o papel.'],
  ])('maps callable error %s to a clear message and logs it', async (code, text) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage(fakeApi({ setRole: () => Promise.reject(Object.assign(new Error('x'), { code })) }));
    await screen.findByText('Kaique Silva');
    fireEvent.change(screen.getByRole('combobox', { name: 'Papel de Kaique Silva' }), {
      target: { value: 'member' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows empty state', async () => {
    renderPage(fakeApi({ listUsers: () => Promise.resolve([]) }));
    expect(await screen.findByText('Ninguém entrou ainda.')).toBeInTheDocument();
  });

  it('has no trailing space before (você)', async () => {
    renderPage(fakeApi());
    await screen.findByText('Kaique Silva');
    expect(screen.getByText('(você)').parentElement?.textContent).toBe('Maria Souza (você)');
  });

  it('shows error when listing fails', async () => {
    renderPage(fakeApi({ listUsers: () => Promise.reject(new Error('x')) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as pessoas.',
    );
  });
});

describe('maskEmail', () => {
  it('masks after the first character', () => {
    expect(maskEmail('kaique@gmail.com')).toBe('k•••@gmail.com');
    expect(maskEmail('k@gmail.com')).toBe('k•••@gmail.com');
  });
  it('never exposes unmaskable values', () => {
    expect(maskEmail('')).toBe('•••');
    expect(maskEmail('semarroba')).toBe('•••');
    expect(maskEmail('@gmail.com')).toBe('•••');
  });
});

describe('toPersonRow', () => {
  it('falls back to viewer for unknown roles', () => {
    expect(toPersonRow('u9', { displayName: 'A', email: 'a@b.c', role: 'owner' }).role).toBe(
      'viewer',
    );
    expect(toPersonRow('u9', { displayName: 'A', email: 'a@b.c' }).role).toBe('viewer');
    expect(toPersonRow('u9', { displayName: 'A', email: 'a@b.c', role: 'member' }).role).toBe(
      'member',
    );
  });
});
