import { useMemo } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, type AuthGateway } from './auth/AuthProvider';
import { HomePage } from './routes/HomePage';
import { LoginPage } from './routes/LoginPage';
import { RequireAuth } from './routes/RequireAuth';
import { RequireAdmin } from './routes/RequireRole';
import { AppShell } from './ui/AppShell';

export interface AppProps {
  gateway: AuthGateway;
  initialPath?: string;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/pessoas" element={<h2>Pessoas</h2>} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App({ gateway, initialPath }: AppProps) {
  const router = useMemo(
    () =>
      initialPath ? (
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes />
        </MemoryRouter>
      ) : (
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      ),
    [initialPath],
  );
  return <AuthProvider gateway={gateway}>{router}</AuthProvider>;
}
