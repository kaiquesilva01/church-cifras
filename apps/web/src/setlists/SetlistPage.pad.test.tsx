import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { SongsProvider } from '../catalog/SongsProvider';
import { PadContext, type PadContextValue } from '../pad/usePad';
import { fakeCatalogApi, sampleSongs } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { fakeSetlistApi, makeSetlist } from '../test/fakeSetlistApi';
import { ActiveSetlistProvider } from './ActiveSetlistProvider';
import { SetlistPage } from './SetlistPage';

const pad: PadContextValue = {
  status: 'playing',
  note: 'G',
  owner: { kind: 'setlist', setlistId: 'r1' },
  volume: 0.5,
  notice: null,
  toggle: vi.fn(),
  follow: vi.fn(),
  setVolume: vi.fn(),
  cachedNotes: new Set(),
  prefetch: vi.fn(),
};

function mount(padValue: PadContextValue | null) {
  const api = fakeSetlistApi([makeSetlist({ id: 'r1', label: 'Culto de domingo', items: [] })]);
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: 'member',
    access: 'granted',
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  const Pad = ({ children }: { children: ReactNode }) => (
    <PadContext.Provider value={padValue}>{children}</PadContext.Provider>
  );
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/repertorios/r1']}>
        <SongsProvider api={fakeCatalogApi(sampleSongs)}>
          <ActiveSetlistProvider api={api}>
            <Pad>
              <Routes>
                <Route path="/repertorios/:id" element={<SetlistPage api={api} />} />
              </Routes>
            </Pad>
          </ActiveSetlistProvider>
        </SongsProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('SetlistPage pad control', () => {
  it('shows the compact pad control right under the title while this setlist plays', () => {
    mount(pad);
    const title = screen.getByRole('heading', { level: 1 });
    const mini = screen.getByText('Pad G tocando').closest('.pad-mini');
    expect(mini).not.toBeNull();
    expect(title.nextElementSibling).toBe(mini);
    expect(screen.getByRole('button', { name: 'Parar' })).toBeInTheDocument();
  });

  it('does not show it without a provider', () => {
    mount(null);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Parar' })).not.toBeInTheDocument();
  });
});
