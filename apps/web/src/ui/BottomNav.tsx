import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { NAV_TABS, type NavTab } from './navTabs';

const ICONS: Record<NavTab, ReactNode> = {
  musicas: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  repertorio: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>
  ),
  busca: (
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  pad: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  mais: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </>
  ),
};

/** Floating bottom bar with the five root screens. */
export function BottomNav({ active }: { active: NavTab }) {
  return (
    <nav className="bottom-nav" aria-label="Principal">
      {NAV_TABS.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          className="bottom-nav-tab"
          aria-current={tab.id === active ? 'page' : undefined}
        >
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {ICONS[tab.id]}
          </svg>
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
