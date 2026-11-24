import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { PeopleApi } from './people/peopleApi';
import { fakeStatsApi } from './test/fakeStatsApi';
import { fakeCatalogApi } from './test/fakeCatalogApi';
import { createFakeGateway } from './test/fakeGateway';
import { signInAs, type Scenario } from './test/authState';
import { fakeSetlistApi } from './test/fakeSetlistApi';
import { createFakeMinistriesApi } from './test/fakeMinistriesApi';

vi.mock('./import/ImportRoute', () => ({
  default: () => <p>Importar (marker)</p>,
}));

const peopleApi: PeopleApi = {
  listUsers: () => Promise.resolve([]),
  setRole: () => Promise.resolve(),
};

function setup(scenario: Scenario) {
  const gateway = createFakeGateway();
  render(
    <App
      gateway={gateway}
      peopleApi={peopleApi}
      statsApi={fakeStatsApi()}
      catalogApi={fakeCatalogApi()}
      setlistApi={fakeSetlistApi()}
      ministriesApi={createFakeMinistriesApi()}
      initialPath="/importar"
    />,
  );
  signInAs(gateway, scenario);
}

describe('/importar route', () => {
  it('route is admin only', async () => {
    setup({ ministry: { role: 'admin' } });
    expect(await screen.findByText('Importar (marker)')).toBeInTheDocument();
  });

  it('redirects member to the home page', async () => {
    setup({ ministry: { role: 'member' } });
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByText('Importar (marker)')).not.toBeInTheDocument();
  });

  it('shows only the access screen to visitors', async () => {
    setup({});
    expect(
      await screen.findByRole('heading', { name: 'Escolha seu ministério' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Importar (marker)')).not.toBeInTheDocument();
  });
});
