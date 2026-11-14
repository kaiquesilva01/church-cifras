import { useMemo } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, type AuthGateway } from './auth/AuthProvider';
import type { PeopleApi } from './people/peopleApi';
import { PeoplePage } from './people/PeoplePage';
import { HomePage } from './routes/HomePage';
import { LoginPage } from './routes/LoginPage';
import { RequireAuth } from './routes/RequireAuth';
import { RequireAdmin } from './routes/RequireRole';
import { AppShell } from './ui/AppShell';

export interface AppProps {
  gateway: AuthGateway;
  peopleApi: PeopleApi;
  initialPath?: string;
}

function AppRoutes({ peopleApi }: { peopleApi: PeopleApi }) {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/pessoas" element={<PeoplePage api={peopleApi} />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App({ gateway, peopleApi, initialPath }: AppProps) {
  const router = useMemo(
    () =>
      initialPath ? (
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes peopleApi={peopleApi} />
        </MemoryRouter>
      ) : (
        <BrowserRouter>
          <AppRoutes peopleApi={peopleApi} />
        </BrowserRouter>
      ),
    [initialPath, peopleApi],
  );
  return <AuthProvider gateway={gateway}>{router}</AuthProvider>;
}
