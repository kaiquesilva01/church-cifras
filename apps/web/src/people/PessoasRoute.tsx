import { useAuth } from '../auth/useAuth';
import type { MinistriesApi } from '../ministries/ministriesApi';
import { PeoplePage } from './PeoplePage';

/** Rota /pessoas: o ministério vem do vínculo da pessoa (o RequireRole já exige admin dele). */
export function PessoasRoute({ api }: { api: MinistriesApi }) {
  const { user, ministry } = useAuth();
  if (!ministry) return null;
  return (
    <PeoplePage
      api={api}
      ministryId={ministry.id}
      ministryName={ministry.name}
      selfUid={user?.uid}
      appAdminView={false}
    />
  );
}
