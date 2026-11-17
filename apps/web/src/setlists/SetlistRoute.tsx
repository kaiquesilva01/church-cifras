import { SetlistPage } from './SetlistPage';
import type { SetlistApi } from './setlistApi';

// Lazy entry point: the setlist screen stays out of the initial bundle.
export default function SetlistRoute({ api }: { api: SetlistApi }) {
  return <SetlistPage api={api} />;
}
