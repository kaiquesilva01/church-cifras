import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';

/** Eyebrow + big title on the left, the theme button (and optional actions) on the right. */
export function ScreenHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="screen-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="screen-title">{title}</h1>
      </div>
      <div className="screen-actions">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
