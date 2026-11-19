import { Outlet, useLocation } from 'react-router';
import { BottomNav } from './BottomNav';
import { activeNavTab } from './navTabs';

export function AppShell() {
  const { pathname, search } = useLocation();
  const active = activeNavTab(pathname, search);
  return (
    <>
      <main className={active ? 'page has-nav' : 'page'}>
        <Outlet />
      </main>
      {active && <BottomNav active={active} />}
    </>
  );
}
