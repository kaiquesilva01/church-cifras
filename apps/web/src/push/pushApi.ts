import type { FirebaseServices } from '../lib/firebase';
import type { PushApi } from './types';

/** Callables de #98. Mesmo padrão dos demais *Api: o SDK de functions entra sob demanda. */
export function createPushApi({ loadFunctions }: Pick<FirebaseServices, 'loadFunctions'>): PushApi {
  const call = async <Req, Res>(name: string, data?: Req): Promise<Res> => {
    const [{ httpsCallable }, functions] = await Promise.all([
      import('firebase/functions'),
      loadFunctions(),
    ]);
    return (await httpsCallable<Req, Res>(functions, name)(data)).data;
  };
  return {
    async register(token, origin) {
      await call('registerDevice', { token, origin });
    },
    async unregister(token) {
      await call('unregisterDevice', { token });
    },
    sendTest: () =>
      call<undefined, { sent: number; failed: number; pruned: number }>('sendTestPush'),
  };
}
