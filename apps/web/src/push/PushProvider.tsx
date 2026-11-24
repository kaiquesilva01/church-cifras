import { useEffect, type ReactNode } from 'react';
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
  const { status, user, access, ministry } = useAuth();
  const uid = status === 'signed-in' ? user?.uid : undefined;
  const eligible = access === 'granted' && ministry !== null;

  useEffect(() => {
    if (!service || !uid || !eligible) return;
    void service.revalidate();
  }, [service, uid, eligible]);

  return <PushContext.Provider value={service}>{children}</PushContext.Provider>;
}
