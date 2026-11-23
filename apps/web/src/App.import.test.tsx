import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { Role } from './auth/roles';
import type { PeopleApi } from './people/peopleApi';
import { fakeStatsApi } from './test/fakeStatsApi';
import { fakeCatalogApi } from './test/fakeCatalogApi';
import { createFakeGateway, testUser } from './test/fakeGateway';
import { fakeSetlistApi } from './test/fakeSetlistApi';

vi.mock('./import/ImportRoute', () => ({
  default: () => <p>Importar (marker)</p>,
}));

const peopleApi: PeopleApi = {
  listUsers: () => Promise.resolve([]),
  setRole: () => Promise.resolve(),
};

function setup(role: Role) {
  const gateway = createFakeGateway();
  render(
    <App
      gateway={gateway}
      peopleApi={peopleApi}
      statsApi={fakeStatsApi()}
      catalogApi={fakeCatalogApi()}
      setlistApi={fakeSetlistApi()}
      initialPath="/importar"
    />,
  );
  gateway.claimRole = role;
  act(() => gateway.emitUser(testUser));
  act(() => gateway.emitRole(role));
}

describe('/importar route', () => {
  it('route is admin only', async () => {
    setup('admin');
    expect(await screen.findByText('Importar (marker)')).toBeInTheDocument();
  });

  it('redirects member to the home page', async () => {
    setup('member');
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByText('Importar (marker)')).not.toBeInTheDocument();
  });

  it('shows only the access screen to visitors', async () => {
    setup('viewer');
    expect(
      await screen.findByRole('heading', { name: 'Acesso ainda não liberado' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Importar (marker)')).not.toBeInTheDocument();
  });
});
