import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { Role } from './auth/roles';
import type { PeopleApi } from './people/peopleApi';
import { fakeCatalogApi } from './test/fakeCatalogApi';
import { createFakeGateway, testUser } from './test/fakeGateway';

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
      catalogApi={fakeCatalogApi()}
      initialPath="/importar"
    />,
  );
  act(() => gateway.emitUser(testUser));
  act(() => gateway.emitRole(role));
}

describe('/importar route', () => {
  it('route is admin only', async () => {
    setup('admin');
    expect(await screen.findByText('Importar (marker)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Importar' })).toBeInTheDocument();
  });

  it.each(['member', 'viewer'] as const)('redirects %s to the home page', async (role) => {
    setup(role);
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByText('Importar (marker)')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Importar' })).not.toBeInTheDocument();
  });
});
