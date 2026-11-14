import { Suspense, lazy, useMemo } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, type AuthGateway } from './auth/AuthProvider';
import type { CatalogApi } from './catalog/catalogApi';
import { SongsProvider } from './catalog/SongsProvider';
import type { PeopleApi } from './people/peopleApi';
import { PeoplePage } from './people/PeoplePage';
import { LoginPage } from './routes/LoginPage';
import { RequireAuth } from './routes/RequireAuth';
import { ErrorBoundary } from './routes/ErrorBoundary';
import { RequireRole } from './routes/RequireRole';
import { ArtistPage } from './search/ArtistPage';
import { HomePage } from './search/HomePage';
import { SongPage } from './search/SongPage';
import { AppShell } from './ui/AppShell';

const UploadRoute = lazy(() => import('./upload/UploadRoute'));

export interface AppProps {
  gateway: AuthGateway;
  peopleApi: PeopleApi;
  catalogApi: CatalogApi;
  initialPath?: string;
  /** Recarrega a página (injetável nos testes). */
  onReload?: () => void;
}

function AppRoutes({
  peopleApi,
  catalogApi,
  onReload,
}: {
  peopleApi: PeopleApi;
  catalogApi: CatalogApi;
  onReload: () => void;
}) {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route
          element={
            <SongsProvider api={catalogApi}>
              <AppShell />
            </SongsProvider>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="/cantores/:artistId" element={<ArtistPage />} />
          <Route path="/musicas/:songId" element={<SongPage api={catalogApi} />} />
          <Route element={<RequireRole roles={['member', 'admin']} />}>
            <Route
              path="/nova"
              element={
                <ErrorBoundary onReload={onReload}>
                  <Suspense
                    fallback={
                      <p role="status" className="status">
                        Carregando…
                      </p>
                    }
                  >
                    <UploadRoute api={catalogApi} />
                  </Suspense>
                </ErrorBoundary>
              }
            />
          </Route>
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/pessoas" element={<PeoplePage api={peopleApi} />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const reloadPage = () => window.location.reload();

export function App({
  gateway,
  peopleApi,
  catalogApi,
  initialPath,
  onReload = reloadPage,
}: AppProps) {
  const router = useMemo(
    () =>
      initialPath ? (
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes peopleApi={peopleApi} catalogApi={catalogApi} onReload={onReload} />
        </MemoryRouter>
      ) : (
        <BrowserRouter>
          <AppRoutes peopleApi={peopleApi} catalogApi={catalogApi} onReload={onReload} />
        </BrowserRouter>
      ),
    [initialPath, peopleApi, catalogApi, onReload],
  );
  return <AuthProvider gateway={gateway}>{router}</AuthProvider>;
}
