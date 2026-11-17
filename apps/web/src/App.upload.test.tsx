import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { Role } from './auth/roles';
import type { PeopleApi } from './people/peopleApi';
import { fakeCatalogApi } from './test/fakeCatalogApi';
import { createFakeGateway, testUser } from './test/fakeGateway';
import { fakeSetlistApi } from './test/fakeSetlistApi';

vi.mock('./upload/UploadRoute', () => ({
  default: () => <p>Nova cifra (marker)</p>,
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
      setlistApi={fakeSetlistApi()}
      initialPath="/nova"
    />,
  );
  act(() => gateway.emitUser(testUser));
  act(() => gateway.emitRole(role));
}

describe('/nova route', () => {
  it('shows the fallback first and then the page for members', async () => {
    setup('member');
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(await screen.findByText('Nova cifra (marker)')).toBeInTheDocument();
  });

  it('redirects viewers to the home page', async () => {
    setup('viewer');
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByText('Nova cifra (marker)')).not.toBeInTheDocument();
  });
});
