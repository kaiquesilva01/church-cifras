import { Outlet, useLocation } from 'react-router';
import { canShowRepertorios } from '../auth/permissions';
import { useAuth } from '../auth/useAuth';
import { BottomNav } from './BottomNav';
import { activeNavTab } from './navTabs';

export function AppShell() {
  const auth = useAuth();
  const { pathname, search } = useLocation();
  const showRepertorio = canShowRepertorios(auth);
  const active = activeNavTab(pathname, search, showRepertorio);
  return (
    <>
      <main className={active ? 'page has-nav' : 'page'}>
        <Outlet />
      </main>
      {active && <BottomNav active={active} showRepertorio={showRepertorio} />}
    </>
  );
}
