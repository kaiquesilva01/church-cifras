import { useEffect, type ReactNode } from 'react';
import { canEdit } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import { PushContext, type PushService } from './types';

/**
 * Revalida o aparelho quando o app abre com sessão de membro ou admin (uma vez por sessão).
 * Sem serviço (sem VAPID), não faz nada. Fica dentro do AuthProvider.
 */
export function PushProvider({
  service,
  children,
}: {
  service: PushService | null;
  children: ReactNode;
}) {
  const { status, user, role } = useAuth();
  const uid = status === 'signed-in' ? user?.uid : undefined;
  const eligible = canEdit(role);

  useEffect(() => {
    if (!service || !uid || !eligible) return;
    void service.revalidate();
  }, [service, uid, eligible]);

  return <PushContext.Provider value={service}>{children}</PushContext.Provider>;
}
