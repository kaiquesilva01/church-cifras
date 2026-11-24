import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { PeopleApi } from './people/peopleApi';
import { fakeStatsApi } from './test/fakeStatsApi';
import { fakeCatalogApi } from './test/fakeCatalogApi';
import { createFakeGateway } from './test/fakeGateway';
import { signInAs } from './test/authState';
import { fakeSetlistApi } from './test/fakeSetlistApi';

vi.mock('./upload/UploadRoute', () => {
  throw new Error('chunk failed');
});

const peopleApi: PeopleApi = {
  listUsers: () => Promise.resolve([]),
  setRole: () => Promise.resolve(),
};

describe('/nova route failure', () => {
  it('shows the boundary message and reloads on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onReload = vi.fn();
    const gateway = createFakeGateway();
    render(
      <App
        gateway={gateway}
        peopleApi={peopleApi}
        statsApi={fakeStatsApi()}
        catalogApi={fakeCatalogApi()}
        setlistApi={fakeSetlistApi()}
        initialPath="/nova"
        onReload={onReload}
      />,
    );
    signInAs(gateway, { ministry: { role: 'member' } });
    expect(await screen.findByText('Não foi possível carregar a página.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
