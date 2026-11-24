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

vi.mock('./upload/UploadRoute', () => ({
  default: () => <p>Nova cifra (marker)</p>,
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
      initialPath="/nova"
    />,
  );
  signInAs(gateway, scenario);
}

describe('/nova route', () => {
  it('shows the fallback first and then the page for members', async () => {
    setup({ ministry: { role: 'member' } });
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(await screen.findByText('Nova cifra (marker)')).toBeInTheDocument();
  });

  it('shows only the access screen to visitors', async () => {
    setup({});
    expect(
      await screen.findByRole('heading', { name: 'Escolha seu ministério' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nova cifra (marker)')).not.toBeInTheDocument();
  });
});
