import { Suspense, lazy, useMemo } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, type AuthGateway } from './auth/AuthProvider';
import type { CatalogApi } from './catalog/catalogApi';
import { LyricsProvider } from './catalog/LyricsProvider';
import { SongsProvider } from './catalog/SongsProvider';
import { PadProvider } from './pad/PadProvider';
import { PushProvider } from './push/PushProvider';
import type { PushService } from './push/types';
import { ActiveSetlistProvider } from './setlists/ActiveSetlistProvider';
import type { SetlistApi } from './setlists/setlistApi';
import type { MinistriesApi } from './ministries/ministriesApi';
import { SetlistsProvider } from './setlists/SetlistsProvider';
import type { PeopleApi } from './people/peopleApi';
import { PeoplePage } from './people/PeoplePage';
import type { StatsApi } from './stats/statsApi';
import { StatsPage } from './stats/StatsPage';
import { loadViewerRoute } from './lib/prefetch';
import { LoginPage } from './routes/LoginPage';
import { RequireAccess } from './routes/RequireAccess';
import { RequireAuth } from './routes/RequireAuth';
import { ErrorBoundary } from './routes/ErrorBoundary';
import { RequireRole } from './routes/RequireRole';
import { ArtistPage } from './search/ArtistPage';
import { BuscaPage } from './search/BuscaPage';
import { HomePage } from './search/HomePage';
import { MaisPage } from './more/MaisPage';
import { PadPage } from './pad/PadPage';
import { AppShell } from './ui/AppShell';
import { CifraLoader } from './ui/CifraLoader';
import { ThemeProvider } from './ui/ThemeProvider';

const UploadRoute = lazy(() => import('./upload/UploadRoute'));
const ImportRoute = lazy(() => import('./import/ImportRoute'));
const ViewerRoute = lazy(loadViewerRoute);
const SetlistRoute = lazy(() => import('./setlists/SetlistRoute'));

export interface AppProps {
  gateway: AuthGateway;
  peopleApi: PeopleApi;
  statsApi: StatsApi;
  catalogApi: CatalogApi;
  setlistApi: SetlistApi;
  /** Entrada de quem não tem ministério (escolha e pedido). */
  ministriesApi: MinistriesApi;
  initialPath?: string;
  /** Recarrega a página (injetável nos testes). */
  onReload?: () => void;
  /** Avisos de push; `null` (ou ausente) quando não há VAPID configurada. */
  pushService?: PushService | null;
}

function AppRoutes({
  peopleApi,
  statsApi,
  catalogApi,
  setlistApi,
  ministriesApi,
  onReload,
}: {
  peopleApi: PeopleApi;
  statsApi: StatsApi;
  catalogApi: CatalogApi;
  setlistApi: SetlistApi;
  ministriesApi: MinistriesApi;
  onReload: () => void;
}) {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<RequireAccess api={ministriesApi} />}>
          <Route
            element={
              <SongsProvider api={catalogApi}>
                <LyricsProvider api={catalogApi}>
                  <SetlistsProvider api={setlistApi}>
                    <ActiveSetlistProvider api={setlistApi}>
                      <PadProvider fetchBytes={catalogApi.getPdfBytes}>
                        <AppShell />
                      </PadProvider>
                    </ActiveSetlistProvider>
                  </SetlistsProvider>
                </LyricsProvider>
              </SongsProvider>
            }
          >
            <Route index element={<HomePage setlistApi={setlistApi} />} />
            <Route path="/busca" element={<BuscaPage />} />
            <Route path="/pad" element={<PadPage />} />
            <Route path="/mais" element={<MaisPage />} />
            <Route path="/cantores/:artistId" element={<ArtistPage />} />
            <Route
              path="/musicas/:songId"
              element={
                <ErrorBoundary onReload={onReload}>
                  <Suspense fallback={<CifraLoader />}>
                    <ViewerRoute api={catalogApi} />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route
              path="/repertorios/:id"
              element={
                <ErrorBoundary onReload={onReload}>
                  <Suspense
                    fallback={
                      <p role="status" className="status">
                        Carregando…
                      </p>
                    }
                  >
                    <SetlistRoute api={setlistApi} />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route element={<RequireRole when="upload" />}>
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
            <Route element={<RequireRole when="ministryAdmin" />}>
              <Route path="/pessoas" element={<PeoplePage api={peopleApi} />} />
              <Route path="/estatisticas" element={<StatsPage api={statsApi} />} />
            </Route>
            <Route element={<RequireRole when="upload" />}>
              <Route
                path="/importar"
                element={
                  <ErrorBoundary onReload={onReload}>
                    <Suspense
                      fallback={
                        <p role="status" className="status">
                          Carregando…
                        </p>
                      }
                    >
                      <ImportRoute api={catalogApi} />
                    </Suspense>
                  </ErrorBoundary>
                }
              />
            </Route>
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
  statsApi,
  catalogApi,
  setlistApi,
  ministriesApi,
  initialPath,
  onReload = reloadPage,
  pushService,
}: AppProps) {
  const router = useMemo(
    () =>
      initialPath ? (
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes
            peopleApi={peopleApi}
            statsApi={statsApi}
            catalogApi={catalogApi}
            setlistApi={setlistApi}
            ministriesApi={ministriesApi}
            onReload={onReload}
          />
        </MemoryRouter>
      ) : (
        <BrowserRouter>
          <AppRoutes
            peopleApi={peopleApi}
            statsApi={statsApi}
            catalogApi={catalogApi}
            setlistApi={setlistApi}
            ministriesApi={ministriesApi}
            onReload={onReload}
          />
        </BrowserRouter>
      ),
    [initialPath, peopleApi, statsApi, catalogApi, setlistApi, ministriesApi, onReload],
  );
  return (
    <ThemeProvider>
      <AuthProvider gateway={gateway}>
        <PushProvider service={pushService ?? null}>{router}</PushProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
