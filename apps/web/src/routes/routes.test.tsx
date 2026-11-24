import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { Role } from '../auth/roles';
import { reloadPage } from '../lib/reloadPage';
import { signInAs, type Scenario } from '../test/authState';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import { createFakeGateway, testUser } from '../test/fakeGateway';
import { fakeSetlistApi, makeSetlist } from '../test/fakeSetlistApi';
import { createFakeMinistriesApi } from '../test/fakeMinistriesApi';
import { fakeStatsApi } from '../test/fakeStatsApi';

vi.mock('../lib/reloadPage', () => ({ reloadPage: vi.fn() }));

function scenarioOf(role: Role): Scenario {
  if (role === 'viewer') return {};
  return { ministry: { role } };
}

/** Os claims do token são a fonte do gate: o login os traz junto com o vínculo (`signInAs`). */
async function setup(path: string, signedIn?: Role) {
  const gateway = createFakeGateway();
  render(
    <App
      gateway={gateway}
      statsApi={fakeStatsApi()}
      catalogApi={fakeCatalogApi()}
      setlistApi={fakeSetlistApi()}
      ministriesApi={createFakeMinistriesApi()}
      initialPath={path}
    />,
  );
  if (signedIn) signInAs(gateway, scenarioOf(signedIn));
  else await act(async () => gateway.emitUser(null));
  // Deixa as páginas lazy carregarem (o fallback "Carregando…" sai depois de uma volta de microtarefas).
  await act(async () => undefined);
  return gateway;
}

describe('routes', () => {
  it('redirects signed-out user to login', async () => {
    await setup('/');
    expect(screen.getByText('Entrar com Google')).toBeInTheDocument();
  });

  it('login explains that the first access chooses a ministry and waits for an admin', async () => {
    await setup('/login');
    expect(
      screen.getByText(
        'Quem entra pela primeira vez escolhe o ministério e pede para entrar. Um admin aprova.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Cifras · Louvor' })).toBeInTheDocument();
  });

  it('login screen warms the sign-in popup on mount', async () => {
    const gateway = await setup('/login');
    expect(gateway.prepareSignIn).toHaveBeenCalledTimes(1);
  });

  it('login button calls signIn', async () => {
    const gateway = await setup('/login');
    fireEvent.click(screen.getByText('Entrar com Google'));
    expect(gateway.signIn).toHaveBeenCalledTimes(1);
  });

  it('shows error when signIn fails', async () => {
    const gateway = createFakeGateway();
    gateway.signIn = () => Promise.reject(new Error('popup'));
    render(
      <App
        gateway={gateway}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        ministriesApi={createFakeMinistriesApi()}
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
          statsApi={fakeStatsApi()}
          catalogApi={fakeCatalogApi()}
          setlistApi={fakeSetlistApi()}
          ministriesApi={createFakeMinistriesApi()}
          initialPath="/login"
        />,
      );
      act(() => gateway.emitUser(null));
      fireEvent.click(screen.getByText('Entrar com Google'));
      await waitFor(() => expect(screen.getByText('Entrar com Google')).toBeEnabled());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('shows home for a signed-in member without Pessoas link', async () => {
    await setup('/', 'member');
    expect(
      screen.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pessoas' })).not.toBeInTheDocument();
  });

  it('shows Pessoas do ministério (to Pessoas) in Mais for ministry admin only', async () => {
    await setup('/mais', 'admin');
    expect(screen.getByRole('link', { name: /^Pessoas do ministério/ })).toHaveAttribute(
      'href',
      '/pessoas',
    );
    cleanup();
    await setup('/mais', 'member');
    expect(screen.queryByRole('link', { name: /Pessoas do ministério/ })).not.toBeInTheDocument();
  });

  it('redirects non-admin away from /pessoas', async () => {
    await setup('/pessoas', 'member');
    expect(
      screen.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' }),
    ).toBeInTheDocument();
  });

  it('RequireRole allows listed roles and redirects others', async () => {
    await setup('/pessoas', 'admin');
    expect(screen.getByRole('heading', { name: 'Pessoas' })).toBeInTheDocument();
    cleanup();
    await setup('/pessoas', 'member');
    expect(screen.queryByRole('heading', { name: 'Pessoas' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' }),
    ).toBeInTheDocument();
  });

  it('RequireRole sends non-admins from /estatisticas to home and lets admins in', async () => {
    await setup('/estatisticas', 'member');
    expect(
      screen.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Estatísticas' })).not.toBeInTheDocument();
    cleanup();
    await setup('/estatisticas', 'admin');
    expect(screen.getByRole('heading', { level: 1, name: 'Estatísticas' })).toBeInTheDocument();
  });

  it('waits for the role before deciding on /pessoas', async () => {
    const gateway = createFakeGateway();
    gateway.claims = { appAdmin: false, hasMinistry: true, canUploadSong: true };
    render(
      <App
        gateway={gateway}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        ministriesApi={createFakeMinistriesApi()}
        initialPath="/pessoas"
      />,
    );
    await act(async () => gateway.emitUser(testUser));
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    await act(async () => gateway.emitProfile({ appAdmin: false }));
    await act(async () => gateway.emitMemberships([{ ministryId: 'hajaluz', role: 'admin' }]));
    act(() => gateway.emitMinistry({ name: 'Haja Luz', city: 'São Paulo' }));
    await act(async () => undefined);
    expect(screen.getByRole('heading', { name: 'Pessoas' })).toBeInTheDocument();
  });

  it('shows a retry error instead of waiting forever when the ministry fails to load', async () => {
    await setup('/pessoas', 'admin');
    expect(screen.getByRole('heading', { name: 'Pessoas' })).toBeInTheDocument();
    cleanup();
    const failing = createFakeGateway();
    render(
      <App
        gateway={failing}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        ministriesApi={createFakeMinistriesApi()}
        initialPath="/pessoas"
      />,
    );
    failing.claims = { appAdmin: false, hasMinistry: true, canUploadSong: true };
    await act(async () => failing.emitUser(testUser));
    await act(async () => failing.emitProfile({ appAdmin: false }));
    await act(async () => failing.emitMemberships([{ ministryId: 'hajaluz', role: 'admin' }]));
    act(() => failing.failMinistry());
    await act(async () => undefined);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o ministério. Tente de novo.',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pessoas' })).not.toBeInTheDocument();
    expect(failing.signOut).not.toHaveBeenCalled();
  });

  it('Tentar de novo no erro do ministério recarrega a página', async () => {
    vi.mocked(reloadPage).mockClear();
    const failing = createFakeGateway();
    render(
      <App
        gateway={failing}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        ministriesApi={createFakeMinistriesApi()}
        initialPath="/mais"
      />,
    );
    failing.claims = { appAdmin: false, hasMinistry: true, canUploadSong: false };
    await act(async () => failing.emitUser(testUser));
    await act(async () => failing.emitProfile({ appAdmin: false }));
    await act(async () => failing.emitMemberships([{ ministryId: 'hajaluz', role: 'member' }]));
    act(() => failing.failMinistry());
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('ministério que não existe: mensagem própria, sem botão de tentar de novo', async () => {
    const missing = createFakeGateway();
    render(
      <App
        gateway={missing}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        ministriesApi={createFakeMinistriesApi()}
        initialPath="/mais"
      />,
    );
    missing.claims = { appAdmin: false, hasMinistry: true, canUploadSong: false };
    await act(async () => missing.emitUser(testUser));
    await act(async () => missing.emitProfile({ appAdmin: false }));
    await act(async () => missing.emitMemberships([{ ministryId: 'hajaluz', role: 'member' }]));
    act(() => missing.emitMinistry(null));
    await act(async () => undefined);
    expect(screen.getByText('Ministério não encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('Mais shows the ministry error instead of the Visitante label when the ministry fails', async () => {
    const failing = createFakeGateway();
    render(
      <App
        gateway={failing}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        ministriesApi={createFakeMinistriesApi()}
        initialPath="/mais"
      />,
    );
    failing.claims = { appAdmin: false, hasMinistry: true, canUploadSong: false };
    await act(async () => failing.emitUser(testUser));
    await act(async () => failing.emitProfile({ appAdmin: false }));
    await act(async () => failing.emitMemberships([{ ministryId: 'hajaluz', role: 'member' }]));
    act(() => failing.failMinistry());
    await act(async () => undefined);
    expect(
      screen.getByText('Não foi possível carregar o ministério. Tente de novo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Visitante')).not.toBeInTheDocument();
  });

  it('disables the login button while the popup is open', async () => {
    const gateway = createFakeGateway();
    gateway.signIn = () => new Promise(() => undefined);
    render(
      <App
        gateway={gateway}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        ministriesApi={createFakeMinistriesApi()}
        initialPath="/login"
      />,
    );
    act(() => gateway.emitUser(null));
    fireEvent.click(screen.getByText('Entrar com Google'));
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeDisabled();
  });

  it('Mais shows the role label and Sair', async () => {
    const gateway = await setup('/mais', 'member');
    expect(screen.getByText('Haja Luz · Membro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sair/ }));
    expect(gateway.signOut).toHaveBeenCalledTimes(1);
  });

  it('returns to the protected screen after signing in, not to home', async () => {
    const gateway = createFakeGateway();
    const setlistApi = fakeSetlistApi([makeSetlist({ id: 'r1', label: 'Culto de domingo' })]);
    render(
      <App
        gateway={gateway}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi()}
        setlistApi={setlistApi}
        ministriesApi={createFakeMinistriesApi()}
        initialPath="/repertorios/r1"
      />,
    );
    act(() => gateway.emitUser(null));
    expect(screen.getByText('Entrar com Google')).toBeInTheDocument();

    signInAs(gateway, { ministry: { role: 'member' } });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Culto de domingo' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('searchbox', { name: 'Buscar música, cantor ou letra…' }),
    ).not.toBeInTheDocument();
  });

  it('shows the bottom bar on the root screens and hides it on details', async () => {
    await setup('/', 'member');
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    cleanup();
    await setup('/nova', 'admin');
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  });
});

describe('visitante sem acesso (#126)', () => {
  it.each([
    '/',
    '/busca',
    '/pad',
    '/mais',
    '/musicas/s1',
    '/repertorios/r1',
    '/pessoas',
    '/nova',
    '/importar',
  ])('visitor sees only the access screen at %s', async (path) => {
    await setup(path, 'viewer');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Escolha seu ministério' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  });

  it('visitor does not start any data provider', async () => {
    const subscribeSongs = vi.fn(() => () => undefined);
    const subscribeSetlists = vi.fn(() => () => undefined);
    const gateway = createFakeGateway();
    render(
      <App
        gateway={gateway}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi(undefined, { subscribeSongs })}
        setlistApi={fakeSetlistApi([], { subscribeSetlists })}
        ministriesApi={createFakeMinistriesApi()}
        initialPath="/"
      />,
    );
    signInAs(gateway);
    await act(async () => undefined);
    expect(screen.getByRole('heading', { name: 'Escolha seu ministério' })).toBeInTheDocument();
    expect(subscribeSongs).not.toHaveBeenCalled();
    expect(subscribeSetlists).not.toHaveBeenCalled();
  });

  it('member is redirected to the app after the claim arrives', async () => {
    const gateway = createFakeGateway();
    render(
      <App
        gateway={gateway}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        ministriesApi={createFakeMinistriesApi()}
        initialPath="/"
      />,
    );
    signInAs(gateway);
    await act(async () => undefined);
    expect(screen.getByRole('heading', { name: 'Escolha seu ministério' })).toBeInTheDocument();
    // O vínculo chega e o token é renovado com o claim novo (o fake copia nextClaims no refresh).
    gateway.nextClaims = { appAdmin: false, hasMinistry: true, canUploadSong: false };
    await act(async () => gateway.emitMemberships([{ ministryId: 'hajaluz', role: 'member' }]));
    act(() => gateway.emitMinistry({ name: 'Haja Luz', city: 'São Paulo' }));
    expect(
      await screen.findByRole('searchbox', { name: 'Buscar música, cantor ou letra…' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Escolha seu ministério' })).toBeNull();
  });
});
