import { useEffect, useRef, useState } from 'react';
import type { AvisosStatus, PushService, TestStatus } from './types';

export interface AvisosView {
  status: AvisosStatus;
  test: TestStatus;
  enable(): void;
  disable(): void;
  sendTest(): void;
  /** Relê o estado da linha. Nunca chama `enable`: a permissão pede no próximo toque. */
  retry(): void;
}

export function usePushAvisos(service: PushService): AvisosView {
  const [status, setStatus] = useState<AvisosStatus>('checking');
  const [test, setTest] = useState<TestStatus>('idle');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    service
      .load()
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [service]);

  // `work()` roda na mesma chamada do clique: o toque em Ativar chega ao SDK sem await antes.
  const run = (pending: AvisosStatus, work: () => Promise<AvisosStatus>) => {
    setStatus(pending);
    work().then(setStatus, () => setStatus('error'));
  };

  return {
    status,
    test,
    enable: () => {
      setTest('idle');
      run('enabling', () => service.enable());
    },
    disable: () => {
      setTest('idle');
      run('disabling', () => service.disable());
    },
    sendTest: () => {
      setTest('sending');
      service
        .sendTest()
        .then(async (result) => {
          setTest(result);
          if (result !== 'failed') return;
          // Falhou: o servidor pode ter apagado o aparelho; relê o estado da linha.
          // Só aplica se a linha ainda está 'active' (outra ação pode ter mudado o estado).
          try {
            const next = await service.load();
            setStatus((prev) => (prev === 'active' ? next : prev));
          } catch {
            // Falha ao reler: mantém o estado atual e o resultado 'failed'.
          }
        })
        .catch(() => setTest('failed'));
    },
    retry: () => {
      setStatus('checking');
      service.load().then(
        (next) => {
          if (mounted.current) setStatus(next);
        },
        () => {
          if (mounted.current) setStatus('error');
        },
      );
    },
  };
}
