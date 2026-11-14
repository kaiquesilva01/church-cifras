import { useMemo } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, type AuthGateway } from './auth/AuthProvider';
import type { CatalogApi } from './catalog/catalogApi';
import type { PeopleApi } from './people/peopleApi';
import { PeoplePage } from './people/PeoplePage';
import { LoginPage } from './routes/LoginPage';
import { RequireAuth } from './routes/RequireAuth';
import { RequireRole } from './routes/RequireRole';
import { ArtistPage } from './search/ArtistPage';
import { HomePage } from './search/HomePage';
import { SongPage } from './search/SongPage';
import { AppShell } from './ui/AppShell';

export interface AppProps {
  gateway: AuthGateway;
  peopleApi: PeopleApi;
  catalogApi: CatalogApi;
  initialPath?: string;
}

function AppRoutes({ peopleApi, catalogApi }: { peopleApi: PeopleApi; catalogApi: CatalogApi }) {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage api={catalogApi} />} />
          <Route path="/cantores/:artistId" element={<ArtistPage api={catalogApi} />} />
          <Route path="/musicas/:songId" element={<SongPage api={catalogApi} />} />
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/pessoas" element={<PeoplePage api={peopleApi} />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App({ gateway, peopleApi, catalogApi, initialPath }: AppProps) {
  const router = useMemo(
    () =>
      initialPath ? (
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes peopleApi={peopleApi} catalogApi={catalogApi} />
        </MemoryRouter>
      ) : (
        <BrowserRouter>
          <AppRoutes peopleApi={peopleApi} catalogApi={catalogApi} />
        </BrowserRouter>
      ),
    [initialPath, peopleApi, catalogApi],
  );
  return <AuthProvider gateway={gateway}>{router}</AuthProvider>;
}
